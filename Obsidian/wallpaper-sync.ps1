# Obsidian Wallpaper-Sync: stellt dem Spotify-Theme eine kleine Kopie des Desktop-Hintergrunds bereit,
# damit "Farben aus Wallpaper" (Profilbild -> Obsidian-Einstellungen) den Farbton daraus lesen kann.
# Spotifys Oberflaeche darf keine lokalen Dateien lesen, liefert aber %APPDATA%\Spotify\Apps\xpui live aus;
# dorthin kommen obsidian-wallpaper.jpg (480 px breit) und obsidian-wallpaper.json (Versionsstempel).
# Laeuft Wallpaper Engine, wird das Vorschaubild des aktiven Wallpapers genommen, sonst das Windows-Wallpaper.
#
#   wallpaper-sync.ps1 -Install    Autostart-Eintrag anlegen und Helfer sofort starten (keine Admin-Rechte noetig)
#   wallpaper-sync.ps1 -Uninstall  Autostart-Eintrag, laufenden Helfer und Kopie entfernen
#   wallpaper-sync.ps1             einmal abgleichen
#   wallpaper-sync.ps1 -Watch      alle 10 s pruefen (so laeuft er im Autostart)
param([switch]$Install, [switch]$Uninstall, [switch]$Watch)

$ErrorActionPreference = 'Stop'
$xpui     = Join-Path $env:APPDATA 'Spotify\Apps\xpui'
$imgName  = 'obsidian-wallpaper.jpg'
$jsonName = 'obsidian-wallpaper.json'
$lnk      = Join-Path ([Environment]::GetFolderPath('Startup')) 'Obsidian Wallpaper-Sync.lnk'
$winPs    = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'   # System.Drawing gibt es nur dort

# Wallpaper Engine leaves the Windows wallpaper alone. While it runs, use the preview image of the active
# wallpaper (config.json next to wallpaper32/64.exe -> wallpaperconfig.selectedwallpapers -> project folder -> preview).
# Regex instead of ConvertFrom-Json: config.json can contain keys that only differ in case, which PowerShell 5 rejects.
function Get-WallpaperEngineImage {
    $proc = Get-Process wallpaper64, wallpaper32 -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1
    if (-not $proc) { return $null }
    $cfg = Join-Path (Split-Path $proc.Path) 'config.json'
    if (-not (Test-Path -LiteralPath $cfg)) { return $null }
    $text = [IO.File]::ReadAllText($cfg)
    $m = [regex]::Match($text, '"wallpaperconfig"\s*:\s*\{[^{}]*"selectedwallpapers"\s*:\s*\{\s*"[^"]+"\s*:\s*\{\s*"file"\s*:\s*"((?:[^"\\]|\\.)+)"')
    if (-not $m.Success) { return $null }
    $file = [regex]::Unescape($m.Groups[1].Value)
    $dir = Split-Path $file
    if (-not (Test-Path -LiteralPath $dir)) { return $null }
    $names = @()
    $proj = Join-Path $dir 'project.json'
    if (Test-Path -LiteralPath $proj) {
        try { $p = [IO.File]::ReadAllText($proj) | ConvertFrom-Json; if ($p.preview) { $names += $p.preview } } catch {}
    }
    $names += 'preview.jpg', 'preview.png', 'preview.gif'
    foreach ($n in $names) {
        $f = Join-Path $dir $n
        if (Test-Path -LiteralPath $f) { return Get-Item -LiteralPath $f }   # GIF: System.Drawing reads the first frame
    }
    return $null
}

function Get-Wallpaper {
    $we = Get-WallpaperEngineImage
    if ($we) { return $we }
    $p = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper
    if ($p -and (Test-Path -LiteralPath $p)) { return Get-Item -LiteralPath $p }
    $t = Join-Path $env:APPDATA 'Microsoft\Windows\Themes\TranscodedWallpaper'
    if (Test-Path -LiteralPath $t) { return Get-Item -LiteralPath $t }
    return $null
}

function Sync-Wallpaper {
    if (-not (Test-Path -LiteralPath $xpui)) { return }          # Spicetify (noch) nicht angewendet
    $wp = Get-Wallpaper
    if (-not $wp) { return }
    $v = '{0}-{1}-{2}' -f $wp.LastWriteTimeUtc.Ticks, $wp.Length, $wp.Directory.Name   # folder name: WE project id
    $jsonPath = Join-Path $xpui $jsonName
    $imgPath  = Join-Path $xpui $imgName
    if ((Test-Path -LiteralPath $imgPath) -and (Test-Path -LiteralPath $jsonPath)) {
        try { if ((Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json).v -eq $v) { return } } catch {}
    }
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($wp.FullName)
    try {
        $w = 480
        $h = [Math]::Max(1, [int]($src.Height * $w / $src.Width))
        $bmp = New-Object System.Drawing.Bitmap $w, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
        $g.DrawImage($src, 0, 0, $w, $h)
        $g.Dispose()
        $tmp = "$imgPath.tmp"
        $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bmp.Dispose()
        Move-Item -LiteralPath $tmp -Destination $imgPath -Force
    } finally { $src.Dispose() }
    # JSON zuletzt schreiben: das Theme laedt das Bild erst, wenn sich der Stempel aendert
    [IO.File]::WriteAllText($jsonPath, (@{ v = $v; file = $imgName } | ConvertTo-Json -Compress))
}

function Stop-Watchers {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*wallpaper-sync.ps1*-Watch*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Install) {
    Stop-Watchers
    $target = Join-Path $env:WINDIR 'System32\conhost.exe'
    $args_  = "--headless `"$winPs`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Watch"
    $sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $sc.TargetPath = $target
    $sc.Arguments = $args_
    $sc.WindowStyle = 7
    $sc.Description = 'Obsidian Spicetify-Theme: Wallpaper-Farben'
    $sc.Save()
    Start-Process -FilePath $target -ArgumentList $args_ -WindowStyle Hidden
    Write-Host "Wallpaper-Sync eingerichtet (Autostart: $lnk)."
    Write-Host "In Spotify: Profilbild -> Obsidian-Einstellungen -> 'Farben aus Wallpaper' einschalten."
    return
}

if ($Uninstall) {
    Stop-Watchers
    Remove-Item -LiteralPath $lnk -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $xpui $imgName), (Join-Path $xpui $jsonName) -ErrorAction SilentlyContinue
    Write-Host 'Wallpaper-Sync entfernt.'
    return
}

if ($Watch) {
    $mutex = New-Object System.Threading.Mutex($false, 'Local\ObsidianWallpaperSync')
    if (-not $mutex.WaitOne(0)) { return }                        # laeuft schon
    while ($true) {
        try { Sync-Wallpaper } catch {}
        Start-Sleep -Seconds 10
    }
}

Sync-Wallpaper

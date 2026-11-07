# Obsidian Wallpaper-Sync: stellt dem Spotify-Theme eine kleine Kopie des Desktop-Hintergrunds bereit,
# damit "Farben aus Wallpaper" (Profilbild -> Obsidian-Einstellungen) den Farbton daraus lesen kann.
# Spotifys Oberflaeche darf keine lokalen Dateien lesen, liefert aber %APPDATA%\Spotify\Apps\xpui live aus;
# dorthin kommen obsidian-wallpaper.jpg (480 px breit) und obsidian-wallpaper.json (Versionsstempel).
# Laeuft Wallpaper Engine, wird das Vorschaubild des aktiven Wallpapers genommen, sonst das Windows-Wallpaper.
#
#   wallpaper-sync.ps1 -Install    Autostart-Eintrag anlegen und Helfer sofort starten (keine Admin-Rechte noetig)
#   wallpaper-sync.ps1 -Uninstall  Autostart-Eintrag, laufenden Helfer und Kopie entfernen
#   wallpaper-sync.ps1             einmal abgleichen
#   wallpaper-sync.ps1 -Watch      Dauerbetrieb (so laeuft er im Autostart):
#                                  - Wallpaper Engine laeuft: alle 5 s abgleichen
#                                  - sonst nur auf Anfrage des Themes (Schalter "Farben aus Wallpaper" einschalten,
#                                    Spotify-Start) ueber http://127.0.0.1:47139/sync; alle 5 s wird nur geprueft,
#                                    ob Wallpaper Engine gestartet wurde
param([switch]$Install, [switch]$Uninstall, [switch]$Watch)

$ErrorActionPreference = 'Stop'
$xpui     = Join-Path $env:APPDATA 'Spotify\Apps\xpui'
$imgName  = 'obsidian-wallpaper.jpg'
$jsonName = 'obsidian-wallpaper.json'
$lnk      = Join-Path ([Environment]::GetFolderPath('Startup')) 'Obsidian Wallpaper-Sync.lnk'
$port     = 47139                                                               # muss zu theme.js passen
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

function Test-WallpaperEngine { [bool](Get-Process wallpaper64, wallpaper32 -ErrorAction SilentlyContinue) }

function Get-WindowsWallpaper {
    $p = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper
    if ($p -and (Test-Path -LiteralPath $p)) { return Get-Item -LiteralPath $p }
    $t = Join-Path $env:APPDATA 'Microsoft\Windows\Themes\TranscodedWallpaper'
    if (Test-Path -LiteralPath $t) { return Get-Item -LiteralPath $t }
    return $null
}

function Sync-Wallpaper {
    if (-not (Test-Path -LiteralPath $xpui)) { return }          # Spicetify (noch) nicht angewendet
    $we = Test-WallpaperEngine
    $wp = $null
    if ($we) { $wp = Get-WallpaperEngineImage }
    if (-not $wp) { $wp = Get-WindowsWallpaper }
    if (-not $wp) { return }
    # folder name: WE project id; we: tells the theme whether it has to keep polling
    $v = '{0}-{1}-{2}-{3}' -f $wp.LastWriteTimeUtc.Ticks, $wp.Length, $wp.Directory.Name, [int]$we
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
    [IO.File]::WriteAllText($jsonPath, (@{ v = $v; file = $imgName; we = $we } | ConvertTo-Json -Compress))
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
    $sc.WorkingDirectory = $PSScriptRoot
    $sc.Description = 'Obsidian Spicetify-Theme: Wallpaper-Farben'
    $sc.Save()
    # fixed working directory: otherwise the helper keeps the folder install.ps1 was started from busy (undeletable)
    Start-Process -FilePath $target -ArgumentList $args_ -WindowStyle Hidden -WorkingDirectory $PSScriptRoot
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
    # a killed predecessor leaves the mutex "abandoned": .NET then throws, but we own it anyway
    try { $own = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $own = $true }
    if (-not $own) { return }                                     # laeuft schon
    # Tiny HTTP endpoint for the theme (TcpListener: needs no URL reservation/admin, unlike HttpListener)
    $listener = $null; $accept = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $port
        $listener.Start()
        $accept = $listener.AcceptTcpClientAsync()
    } catch { $listener = $null }
    $lastWe = $null
    while ($true) {
        $we = Test-WallpaperEngine
        # Wallpaper Engine: follow it; otherwise only once when its state changes (start of the helper, WE closed)
        if ($we -or $we -ne $lastWe) { try { Sync-Wallpaper } catch {} }
        $lastWe = $we
        if (-not $accept) { Start-Sleep -Seconds 5; continue }
        # wait up to 5 s for a request from the theme instead of sleeping
        if ($accept.Wait(5000)) {
            $client = $null
            try { $client = $accept.Result } catch {}
            $accept = $listener.AcceptTcpClientAsync()
            if ($client) {
                try {
                    $client.ReceiveTimeout = 2000
                    $stream = $client.GetStream()
                    $buf = New-Object byte[] 4096
                    $n = $stream.Read($buf, 0, $buf.Length)
                    $req = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
                    if ($req -match '^GET /sync') { try { Sync-Wallpaper } catch {} }
                    $resp = "HTTP/1.1 200 OK`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Private-Network: true`r`n" +
                            "Access-Control-Allow-Methods: GET`r`nContent-Type: text/plain`r`nContent-Length: 2`r`nConnection: close`r`n`r`nok"
                    $bytes = [Text.Encoding]::ASCII.GetBytes($resp)
                    $stream.Write($bytes, 0, $bytes.Length)
                    $stream.Flush()
                } catch {} finally { $client.Close() }
            }
        }
    }
}

Sync-Wallpaper

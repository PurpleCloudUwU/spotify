# Obsidian: Diagnose fuer "Farben aus Wallpaper"
# Ausfuehren: Rechtsklick > "Mit PowerShell ausfuehren"  (oder: powershell -ExecutionPolicy Bypass -File debug.ps1)
# Aendert nichts am System. Die Ausgabe landet zusaetzlich in obsidian-debug.txt auf dem Desktop.
# Spotify dabei geoeffnet lassen.

$ErrorActionPreference = 'Continue'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'obsidian-debug.txt'
try { Start-Transcript -LiteralPath $out -Force | Out-Null } catch {}

$winPs = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$theme = Join-Path $env:APPDATA 'spicetify\Themes\Obsidian'
$t     = Join-Path $theme 'wallpaper-sync.ps1'
$x     = Join-Path $env:APPDATA 'Spotify\Apps\xpui'
$json  = Join-Path $x 'obsidian-wallpaper.json'
$lnk   = Join-Path ([Environment]::GetFolderPath('Startup')) 'Obsidian Wallpaper-Sync.lnk'
function Line($k, $v) { Write-Host ('{0,-26}{1}' -f $k, $v) }
function Get-Watchers {
    @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'wallpaper-sync\.ps1.*-Watch' -and $_.CommandLine -notmatch 'CimInstance|debug\.ps1' })
}

Write-Host '=== System'
Line 'Windows:' ([Environment]::OSVersion.Version)
Line 'PowerShell:' $PSVersionTable.PSVersion
Line 'Sprachmodus:' $ExecutionContext.SessionState.LanguageMode
Line 'Store-Spotify:' ([bool](Get-AppxPackage *Spotify* -ErrorAction SilentlyContinue))
$sp = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1
Line 'Spotify laeuft:' ([bool]$sp)
if ($sp) { Line 'Spotify-Pfad:' $sp.Path; Line 'Spotify-Version:' $sp.MainModule.FileVersionInfo.FileVersion }
$spc = Get-Command spicetify -ErrorAction SilentlyContinue
Line 'Spicetify:' $(if ($spc) { (& spicetify -v 2>&1 | Select-Object -First 1) } else { 'nicht im PATH' })
Line 'Wallpaper Engine laeuft:' ([bool](Get-Process wallpaper64, wallpaper32 -ErrorAction SilentlyContinue))

Write-Host ''
Write-Host '=== Theme'
Line 'Theme-Ordner da:' (Test-Path -LiteralPath $theme)
Line 'wallpaper-sync.ps1 da:' (Test-Path -LiteralPath $t)
$tj = Join-Path $theme 'theme.js'
Line 'theme.js aktuell:' $(if (Test-Path -LiteralPath $tj) { [bool](Select-String -LiteralPath $tj -Pattern 'HELPER_PORT' -Quiet) } else { 'fehlt' })
$ini = Join-Path $env:APPDATA 'spicetify\config-xpui.ini'
if (Test-Path -LiteralPath $ini) {
    Get-Content -LiteralPath $ini | Where-Object { $_ -match '^(current_theme|color_scheme|inject_theme_js|inject_css|replace_colors|spotify_path|prefs_path)\s*=' } |
        ForEach-Object { Line '  ini:' $_.Trim() }
} else { Line 'config-xpui.ini:' 'fehlt' }
Line 'xpui-Ordner da:' (Test-Path -LiteralPath $x)
$deployed = Join-Path $x 'extensions\theme.js'
Line 'theme.js in Spotify:' $(if (Test-Path -LiteralPath $deployed) { [bool](Select-String -LiteralPath $deployed -Pattern 'HELPER_PORT' -Quiet) } else { 'nicht gefunden' })

Write-Host ''
Write-Host '=== Helfer'
Line 'Autostart-Eintrag:' (Test-Path -LiteralPath $lnk)
if (Test-Path -LiteralPath $lnk) {
    $sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    Line '  Ziel:' $sc.TargetPath
    Line '  Argumente:' $sc.Arguments
}
$w = @(Get-Watchers)
Line 'Helfer-Prozesse:' $w.Count
try {
    $r = Invoke-WebRequest 'http://127.0.0.1:47139/sync' -UseBasicParsing -TimeoutSec 10
    Line 'Port 47139:' ("OK (" + $r.Content + ")")
} catch { Line 'Port 47139:' ("FEHLER " + $_.Exception.Message) }
$busy = Get-NetTCPConnection -LocalPort 47139 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) { Line '  belegt von:' ((Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).Name + " (PID " + $busy.OwningProcess + ")") }
Line 'Kopie vorher:' (Get-Content -LiteralPath $json -ErrorAction SilentlyContinue)

Write-Host ''
Write-Host '=== Einmal-Lauf (Fehler erscheinen hier)'
if (Test-Path -LiteralPath $t) {
    & $winPs -NoProfile -ExecutionPolicy Bypass -File $t 2>&1 | ForEach-Object { Write-Host "  $_" }
    Line 'Exit-Code:' $LASTEXITCODE
    Line 'Kopie nachher:' (Get-Content -LiteralPath $json -ErrorAction SilentlyContinue)
    $img = Join-Path $x 'obsidian-wallpaper.jpg'
    if (Test-Path -LiteralPath $img) { Line 'Bild:' ("{0} Bytes, {1}" -f (Get-Item -LiteralPath $img).Length, (Get-Item -LiteralPath $img).LastWriteTime) }
}

Write-Host ''
Write-Host '=== Dauerbetrieb 8 s'
if ($w.Count -gt 0) {
    Write-Host '  uebersprungen: der Helfer laeuft bereits (ein zweiter wuerde sich sofort beenden)'
} elseif (Test-Path -LiteralPath $t) {
    $err = Join-Path $env:TEMP 'obsidian-watch-err.txt'
    $p = Start-Process $winPs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$t`" -Watch" -RedirectStandardError $err -PassThru -WindowStyle Hidden
    Start-Sleep 8
    Line 'laeuft nach 8 s:' (-not $p.HasExited)
    if ($p.HasExited) { Line 'Exit-Code:' $p.ExitCode }
    try { Line 'Port 47139 jetzt:' ((Invoke-WebRequest 'http://127.0.0.1:47139/sync' -UseBasicParsing -TimeoutSec 10).Content) } catch { Line 'Port 47139 jetzt:' ("FEHLER " + $_.Exception.Message) }
    Get-Content -LiteralPath $err -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    # also check the real start path (conhost --headless), the way autostart launches it
    $c = Start-Process (Join-Path $env:WINDIR 'System32\conhost.exe') -ArgumentList "--headless `"$winPs`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$t`" -Watch" -PassThru -WindowStyle Hidden
    Start-Sleep 6
    Line 'Start ueber conhost:' $(if (@(Get-Watchers).Count -gt 0) { 'OK, Helfer laeuft' } else { 'Helfer laeuft NICHT' })
    Write-Host '  (der ueber conhost gestartete Helfer bleibt laufen)'
}

Write-Host ''
try { Stop-Transcript | Out-Null } catch {}
Write-Host "Gespeichert: $out"
Read-Host 'Enter zum Schliessen'

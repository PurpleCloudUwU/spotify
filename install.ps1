# Obsidian Spicetify-Theme installieren
# Ausfuehren: Rechtsklick > "Mit PowerShell ausfuehren"  (oder: powershell -ExecutionPolicy Bypass -File install.ps1)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Spicetify nicht gefunden - wird installiert..."
    iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
    $env:PATH += ";$env:LOCALAPPDATA\spicetify"
}
spicetify config | Out-Null   # erzeugt config-xpui.ini falls noch nicht vorhanden
$themes = Join-Path (Split-Path (spicetify -c)) 'Themes'
New-Item -ItemType Directory -Force "$themes\Obsidian" | Out-Null
Copy-Item "$PSScriptRoot\Obsidian\*" "$themes\Obsidian\" -Force
spicetify config current_theme Obsidian color_scheme Obsidian inject_css 1 replace_colors 1 inject_theme_js 1
spicetify backup apply
Write-Host "Fertig - Obsidian ist aktiv."

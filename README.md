# Obsidian – Spicetify-Theme

Purple Spotify-Theme für [Spicetify](https://spicetify.app).

## Installation (Windows)

1. Repo klonen oder als ZIP herunterladen und entpacken.
2. `install.ps1` per Rechtsklick → „Mit PowerShell ausführen“ starten
   (oder `powershell -ExecutionPolicy Bypass -File install.ps1`).

Das Skript installiert Spicetify bei Bedarf, kopiert das Theme nach `%APPDATA%\spicetify\Themes\Obsidian` und aktiviert es.

Voraussetzung: Spotify-Desktop-Version von spotify.com (nicht die Microsoft-Store-Version).

## Manuell

```powershell
Copy-Item .\Obsidian "$env:APPDATA\spicetify\Themes\" -Recurse -Force
spicetify config current_theme Obsidian color_scheme Obsidian inject_theme_js 1
spicetify backup apply
```

## Einstellungen

Profilbild oben rechts anklicken → **Obsidian-Einstellungen**. Änderungen wirken sofort und bleiben gespeichert:

- **Hintergrund-Animation:** FPS mit Fokus (1–60, Standard 30) und ohne Fokus (0–30, Standard 4; 0 = pausiert)
- **Hintergrund-Farben:** Grundfarbe, Linien, Akzentlinien (jede 5. Linie)
- **Farbe allgemein:** Akzentfarbe für Buttons, Fortschrittsbalken und Markierungen

„Standard wiederherstellen“ setzt alles auf die Theme-Werte zurück.

## Nach einem Spotify-Update

```powershell
spicetify backup apply
```

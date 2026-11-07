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

- **Wallpaper:** „Farben aus Wallpaper“ nimmt Grundfarbe, Linien und Akzentfarbe aus dem Farbton deines Desktop-Hintergrunds

„Standard wiederherstellen“ setzt alles auf die Theme-Werte zurück.

### Farben aus Wallpaper

Spotify darf keine Dateien von der Festplatte lesen. Deshalb legt ein kleiner Helfer (`wallpaper-sync.ps1`) eine verkleinerte Kopie des Wallpapers in Spotifys App-Ordner und aktualisiert sie, wenn du das Wallpaper wechselst. Er läuft unsichtbar im Autostart und braucht keine Admin-Rechte. `install.ps1` fragt am Ende, ob er eingerichtet werden soll. Nachträglich geht es so:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:APPDATA\spicetify\Themes\Obsidian\wallpaper-sync.ps1" -Install    # einrichten
powershell -ExecutionPolicy Bypass -File "$env:APPDATA\spicetify\Themes\Obsidian\wallpaper-sync.ps1" -Uninstall  # entfernen
```

Ein neues Wallpaper wird übernommen, sobald Spotify den Fokus bekommt (spätestens nach einer Minute). Läuft Wallpaper Engine, nimmt der Helfer das Vorschaubild des gerade aktiven Wallpapers (bei mehreren Monitoren das des ersten), sonst das normale Windows-Wallpaper.

## Nach einem Spotify-Update

```powershell
spicetify backup apply
```

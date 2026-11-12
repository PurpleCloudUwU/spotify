# Obsidian – Spicetify-Theme

Purple Spotify-Theme für [Spicetify](https://spicetify.app).

## Installation (Windows)

1. Repo klonen oder als ZIP herunterladen und entpacken.
2. `install.ps1` per Rechtsklick → „Mit PowerShell ausführen“ starten
   (oder `powershell -ExecutionPolicy Bypass -File install.ps1`).

Das Skript installiert Spicetify bei Bedarf, kopiert das Theme nach `%APPDATA%\spicetify\Themes\Obsidian` und aktiviert es.

Voraussetzung: Spotify-Desktop-Version von spotify.com (nicht die Microsoft-Store-Version).

Zuletzt getestet mit Spotify 1.3.9.2055 und Spicetify 2.46.7 (12.11.2026).

## Manuell

```powershell
Copy-Item .\Obsidian "$env:APPDATA\spicetify\Themes\" -Recurse -Force
spicetify config current_theme Obsidian color_scheme Obsidian inject_css 1 replace_colors 1 inject_theme_js 1
spicetify backup
spicetify apply
```

## Einstellungen

Profilbild oben rechts anklicken → **Obsidian-Einstellungen**. Änderungen wirken sofort und bleiben gespeichert:

- **Hintergrund-Animation:** FPS mit Fokus (1–60, Standard 30) und ohne Fokus (0–30, Standard 4; 0 = pausiert)
- **Panels:** Deckkraft (0–100 %, Standard 62 %) und Unschärfe (0–40 px, Standard 16 px) von Bibliothek, Liederliste und rechtem Panel. Mit wenig Deckkraft und Unschärfe ist die ASCII-Animation dahinter zu sehen
- **Bewegung:** Der Verlauf auf der Startseite und der Cover-Hintergrund von Playlists, Alben, Künstlern und Profilen bewegen sich langsam (Stärke 10–200 %)
  - **Visualizer:** pulsiert mit Beat und Lautstärke des Songs, dazu leuchten Nachbarfarben der Akzentfarbe je nach Tonhöhe auf (nutzt Spotifys Song-Analyse, kein Audio-Abgriff)
  - **Ausblenden bei Pause:** Verlauf und Cover-Hintergrund gleiten nach oben weg, solange keine Musik läuft
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

- **Wallpaper Engine läuft:** Der Helfer nimmt das Vorschaubild des aktiven Wallpapers (bei mehreren Monitoren das des ersten) und folgt Wechseln automatisch, nach spätestens etwa 20 Sekunden. Wallpaper Engine speichert einen Wechsel selbst manchmal mit etwas Verzögerung.
- **Sonst (normales Windows-Wallpaper):** Der Helfer prüft nicht ständig. Nach einem Wallpaper-Wechsel „Farben aus Wallpaper“ einmal aus- und wieder einschalten, beim Spotify-Start passiert das automatisch. Das Theme fragt den Helfer dafür lokal über `http://127.0.0.1:47139` an. Startet Wallpaper Engine wieder, bemerkt Spotify das nach spätestens einer Minute.

### Fehlersuche

Zeigt der Dialog „Wallpaper-Helfer läuft nicht“: `debug.ps1` per Rechtsklick → „Mit PowerShell ausführen“ (Spotify dabei offen lassen). Das Skript ändert nichts, prüft Theme, Helfer und Port und speichert das Ergebnis als `obsidian-debug.txt` auf dem Desktop.

## Nach einem Spotify-Update

```powershell
spicetify backup apply
```

Meldet Spicetify, dass die Sicherung nicht zur Spotify-Version passt: `spicetify restore backup apply`.

---
title: CLI
description: Das trackr-CLI kapselt die API für Skripte und Terminal-Workflows und bringt ein Vollbild-TUI mit, wenn du im Terminal bleiben willst.
order: 4
updated: 2026-09-10
badge: beta
---

## Installation

Fertige Binaries und ein Homebrew-Tap sind in Arbeit. Bis dahin baust du aus dem Quellcode mit Go 1.26 oder neuer:

```bash title="terminal"
git clone https://github.com/KilicerDev/trackr.git
cd trackr/cli
go build -o trackr .
mv trackr /usr/local/bin/
```

## Anmelden

```bash
trackr login --server https://app.trackr.dev
```

`login` prüft den Server, öffnet deinen Browser und empfängt das Token auf einem Loopback-Port. Das Token landet im Schlüsselbund des Systems (macOS Keychain, Windows Credential Manager oder unter Linux jeder Secret-Service-Anbieter wie GNOME Keyring oder KWallet). Ohne Schlüsselbund fällt es auf eine `0600`-Datei in deinem Konfigurationsverzeichnis zurück und warnt dich. Eine erfolgreiche Anmeldung speichert außerdem die Server-URL in der Konfigurationsdatei.

Optionen: `--no-browser` gibt die URL aus, statt sie zu öffnen (SSH-Sitzungen tun das automatisch); `--token` liest ein vorhandenes Token aus einer verdeckten Eingabe oder von stdin, sodass `pbpaste | trackr login --token` funktioniert.

## Befehle

`trackr` allein im Terminal öffnet das TUI. In einer Pipe gibt es die Hilfe aus.

| Befehl                                                                                                                                                   | Beschreibung                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `trackr whoami [--json]`                                                                                                                                 | Wer du bist, welcher Server, Organisationen und aktive Bereiche.                                                 |
| `trackr task list [--scope mine\|all] [--project KEY] [--status …]`                                                                                      | Aufgaben auflisten. `--project` und `--status` filtern auf dem Client.                                           |
| `trackr task create --title … [--project KEY] [--priority …] [--type …] [--status …] [--due YYYY-MM-DD] [--estimate MIN] [--tag …] [--assignee USER-ID]` | Aufgabe anlegen. `-m "Titel\n\nText"` setzt Titel und Beschreibung zugleich; `--description` setzt sie getrennt. |
| `trackr task view <ref>`                                                                                                                                 | Aufgabe per `SCM-12` oder ID anzeigen.                                                                           |
| `trackr task done <ref>`                                                                                                                                 | Aufgabe als erledigt markieren.                                                                                  |
| `trackr task comment <ref> -m "…"`                                                                                                                       | Aufgabe kommentieren.                                                                                            |
| `trackr ticket list [--segment mine\|watched\|all] [--status …]`                                                                                         | Tickets nach letzter Aktivität.                                                                                  |
| `trackr ticket create --org <slug> --subject "…" -m "…"`                                                                                                 | Ticket öffnen. `-m "Betreff\n\nText"` geht auch ohne `--subject`.                                                |
| `trackr ticket view <ref>`                                                                                                                               | Ticket mit Nachrichten.                                                                                          |
| `trackr ticket update <ref> [--status …] [--priority …] [--category …]`                                                                                  | Ticketfelder ändern.                                                                                             |
| `trackr ticket message <ref> -m "…" [--internal]`                                                                                                        | Antworten, oder eine Team-Notiz hinzufügen.                                                                      |
| `trackr project list`                                                                                                                                    | Sichtbare Projekte.                                                                                              |
| `trackr inbox [--unread] [--limit N]`                                                                                                                    | Benachrichtigungen.                                                                                              |
| `trackr inbox read [id…] [--all]`                                                                                                                        | Benachrichtigungen als gelesen markieren.                                                                        |
| `trackr search <query>`                                                                                                                                  | Alles durchsuchen.                                                                                               |
| `trackr logout`                                                                                                                                          | Gespeichertes Token widerrufen und vergessen.                                                                    |
| `trackr version`                                                                                                                                         | CLI-Version ausgeben.                                                                                            |

Jeder Befehl akzeptiert `--server <url>` und `--verbose`. Shell-Completions liefert `trackr completion <shell>`. Es gibt keine Wiki-, Notiz- oder Chat-Befehle; die leben in der Web-App, der iOS-App und im MCP-Server. Status, Prioritäten, Typen und Kategorien verwenden dieselben Werte wie die [API](/docs/getting-started/core-concepts#status-prioritaten-und-typen).

## Maschinenlesbare Ausgabe

Hänge `--json` an jeden Listen- oder Anzeige-Befehl. Die Ausgabe ist die **exakte Serverantwort**, keine Neukodierung. Weil `task list --project` und `--status` auf dem Client filtern, ist der JSON-Body in Kombination mit `--json` ungefiltert.

```bash
trackr task list --scope mine --json | jq -r '.tasks[] | "\(.id)\t\(.title)"'
```

Exit-Codes: `0` ok · `1` API-, Netzwerk- oder Argumentfehler · `2` Bedienfehler, den trackr selbst erkennt (fehlender Titel, zu kurze Suche) · `3` Anmeldung nötig · `4` nicht gefunden oder kein Zugriff.

## Konfiguration

Die Konfigurationsdatei liegt unter `$XDG_CONFIG_HOME/trackr/config.toml` oder `~/.config/trackr/config.toml`.

```toml title="config.toml"
server = "https://app.trackr.dev"
default_project = "SCM"
# "keyring" (Standard) oder "file"
token_storage = "keyring"
```

Umgebungsvariablen überschreiben die Datei: `TRACKR_SERVER`, `TRACKR_DEFAULT_PROJECT` und `TRACKR_LOG=debug` für Request-Logging. Rangfolge: **Flag › Env › Config › Standard**; nur `server` hat ein Flag, und `token_storage` gibt es nur in der Datei.

## Das TUI

> [!TIP]
> **Tasten**
>
> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Bereiche fokussieren · <kbd>tab</kbd> weiter · <kbd>[</kbd> <kbd>]</kbd> Ansicht wechseln · <kbd>ctrl</kbd>+<kbd>p</kbd> Suchpalette · <kbd>/</kbd> filtern · <kbd>r</kbd> aktualisieren · <kbd>?</kbd> Hilfe · <kbd>esc</kbd> zurück · <kbd>q</kbd> beenden. Vim-Bewegungen funktionieren in Listen.

Das TUI zeigt Aufgaben, Tickets und den Posteingang in Seitenleiste, Liste und Detailbereich, die der Terminalgröße folgen, mit Detailseiten, Formularen und Bestätigungen; die Suche öffnet sich als Overlay. Unter 100 Spalten blendet es die Seitenleiste aus, unter 110 den Detailbereich; das Minimum ist 80×20. Live-Updates stehen auf der Roadmap; <kbd>r</kbd> aktualisiert.

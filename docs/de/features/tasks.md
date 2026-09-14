---
title: Aufgaben & Ansichten
description: Aufgaben sind das Herz von Trackr. Gruppiere sie, wie du denkst, wechsle zwischen Liste und Board und speichere jeden Filter als Ansicht.
order: 1
updated: 2026-09-10
---

## Eigenschaften einer Aufgabe

| Eigenschaft | Werte                                                        |
| ----------- | ------------------------------------------------------------ |
| `status`    | Backlog · Todo · In Arbeit · Pausiert · In Review · Erledigt |
| `priority`  | Keine · Niedrig · Mittel · Hoch · Dringend                   |
| `type`      | Aufgabe · Bug · Verbesserung · Feature · Chore               |
| `assignees` | Ein oder mehrere Mitglieder                                  |
| `estimate`  | Minuten, für die Kapazität in Meine Woche                    |
| `due`       | Ein Kalenderdatum                                            |
| `tags`      | Freie Labels                                                 |

All das bearbeitest du im Detailbereich der Aufgabe. Die globale Befehlspalette (`⌘K`) legt Aufgaben an und springt per Referenz zu allem; Formulare bestätigst du mit `⌘↵`.

## Ansichten wechseln

Schalte oben auf der Aufgaben-Seite zwischen **Liste** und **Board** um. Beide lesen dieselben Daten. Mit **Gruppieren nach** clusterst du nach Projekt, Status, Verantwortlichem oder Priorität, mit dem **Zeitraum** grenzt du auf _nächste 7 Tage_, _nächste 2 Wochen_, _nächster Monat_ oder _nächste 3 Monate_ ein.

Filter, Gruppierung, Untergruppierung, Sortierung und Zeitraum liegen im Ansichtsoptionen-Panel, das sich über den **Filter**-Button öffnet. Der Button trägt eine Zahl mit den aktiven Filtern und ist hervorgehoben, solange einer gesetzt ist, damit du immer weißt, warum eine Aufgabe (nicht) erscheint.

> [!TIP]
> **Gespeicherte Ansichten**
>
> Jede Kombination aus Gruppierung, Filter und Sortierung lässt sich als Ansicht speichern (bis zu 20 pro Seite). Ansichten gelten pro Seite und Nutzer und synchronisieren sich mit der iOS-App, sodass ein am Desktop eingerichteter Filter auf dem Handy einen Tipp entfernt ist.

## Unteraufgaben, Checklisten, Kommentare und Zeit

- Eine Aufgabe kann **Unteraufgaben**, eine **Checkliste** und **Abhängigkeiten** zu anderen Aufgaben haben.
- Jede Aufgabe hat einen **Kommentar-Thread** mit @-Erwähnungen. Erwähnte Personen werden gemäß ihren Einstellungen benachrichtigt.
- **Zeiteinträge** buchen Minuten mit Datum und optionaler Notiz auf eine Aufgabe. Die erfasste Zeit steht neben der Schätzung.
- Der Aktivitätsbereich der Aufgabe listet Anlage, Kommentare und Zeiteinträge. Feldänderungen wie Status- und Zuweisungswechsel landen im **Verlauf des Projekts**.

## Import und Export

Die Aufgaben eines Projekts lassen sich als kommentierte `.jsonc`-Datei exportieren und anderswo wieder importieren — praktisch für Vorlagen und den Umzug zwischen Instanzen. Beides liegt im Projektkopf: Das Einstellungsmenü (Zahnrad) hat **Aufgaben exportieren**, und **Aufgaben importieren** öffnet einen Dialog für dieselbe Struktur. Der Import aktualisiert anhand der Aufgaben-ID, bis zu 500 Aufgaben pro Datei.

```bash title="terminal"
# Alle Aufgaben eines Projekts exportieren (Web-App: Projekt → Einstellungen → Aufgaben exportieren)
GET /projects/<project-id>/tasks/export

# Dieselbe Struktur importieren (Web-App: Projekt → Aufgaben importieren)
POST /projects/<project-id>/tasks/import
```

## Projektvorlagen

Superadmins können unter **Admin → Vorlagen** **Projektvorlagen** mit einem Startsatz an Aufgaben definieren. Veröffentlichte Vorlagen erscheinen im Dialog zum Anlegen eines Projekts; ein Projekt aus einer Vorlage übernimmt deren Aufgaben, sodass wiederkehrende Projekttypen (Website-Launch, Onboarding, Messe) mit fertiger Checkliste starten.

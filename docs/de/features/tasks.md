---
title: Aufgaben & Ansichten
description: Aufgaben sind das Herz von Trackr. Gruppiere sie, wie du denkst, wechsle zwischen Liste und Board und speichere jeden Filter als Ansicht.
order: 1
updated: 2026-11-11
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

## Wiederkehrende Aufgaben

Mit **Wiederholen** im Seitenpanel einer Aufgabe entsteht nach Plan eine frische Kopie: täglich, an gewählten Wochentagen, monatlich an einem bestimmten Tag (der 31. wird in kürzeren Monaten zum letzten Tag) oder jährlich, jeweils alle _n_ Tage, Wochen, Monate oder Jahre. Jede Kopie wird morgens erstellt (09:00 in deiner Zeitzone). **Jede neue Kopie ist fällig** legt ihr Fälligkeitsdatum fest: keins, am Tag der Erstellung oder einige Tage danach (ein Wochenbericht, der montags wiederkehrt und freitags fällig ist, nutzt 4 Tage). Die Serie kann an einem Datum enden.

- **Was kopiert wird.** Beim Einrichten werden Titel, Beschreibung, Checkliste (unabgehakt), Zuständige, Priorität, Tags und Schätzung der Aufgabe als Vorlage der Serie gespeichert. Notizen oder Fortschritt einer Kopie wandern nicht in die nächste. Um die Vorlage zu ändern, bearbeite eine Aufgabe der Serie und setze beim Speichern **Diese Aufgabe als Vorlage verwenden**.
- **Die Aufgabe, an der du es einrichtest, zählt für heute.** Die erste neue Kopie kommt am nächsten geplanten Tag nach heute.
- **Abschließen holt die nächste nach vorn.** Wechselt die neueste Aufgabe einer Serie auf **In Prüfung**, **Erledigt** oder **Abgebrochen**, entsteht die nächste Kopie sofort, datiert auf ihren eigenen Tag, statt erst an dem Morgen. Ältere Kopien lösen das nicht aus. Bleibt die vorige unerledigt, kommen Kopien trotzdem nach Plan.
- **Beim Löschen einer wiederkehrenden Aufgabe** fragt Trackr, ob **nur diese Aufgabe** gelöscht wird (die Wiederholung läuft weiter) oder **diese und alle kommenden Aufgaben** (spätere offene Kopien werden gelöscht und die Wiederholung endet; erledigte Aufgaben bleiben).
- **In der Woche eingeplant.** Jede Kopie landet in der Woche ihrer Zuständigen, an dem Tag, für den sie steht.
- **Pausieren, fortsetzen, beenden.** Pausierte Serien überspringen, was sie erstellt hätten. **Wiederholung beenden** beendet die Serie; bereits erstellte Aufgaben bleiben erhalten.
- **Verpasste Termine.** Waren die Hintergrunddienste über mehrere Termine hinweg nicht erreichbar, wird nur der jüngste nachgeholt, kein Rückstau.
- **In wessen Namen.** Kopien werden im Namen der Person erstellt, die die Serie eingerichtet hat, mit den üblichen Benachrichtigungen und Webhooks. Verliert diese Person den Zugriff oder wird das Projekt archiviert, pausiert die Serie von selbst; wer sie fortsetzt, übernimmt sie.

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

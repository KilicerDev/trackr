---
title: Schnellstart
description: In vier Schritten von der frischen Instanz zum laufenden Projekt. Alles hier geht über die Web-App, das CLI oder die API.
order: 2
updated: 2026-09-10
---

## Vier Schritte zur ersten Aufgabe

:::steps

### Anmelden und Organisation prüfen

Melde dich mit dem Root-Konto an. Deine *interne* Organisation existiert bereits: Sie wird beim Einrichten der Instanz angelegt, und das Root-Konto ist Mitglied. Agenturen legen unter **Admin → Verzeichnis → Organisationen** mit **Neue Organisation** eine Organisation pro Kunde an.

### Team einladen

Öffne **Admin → Verzeichnis → Nutzer** und lade per E-Mail ein. Jede eingeladene Person bekommt eine Organisationsrolle. Starte alle als **Staff** und befördere später. Einladungen laufen nach sieben Tagen ab, wenn sie nicht angenommen werden.

### Erstes Projekt anlegen

Gehe zu **Projekte** und lege eines an. Gib ihm einen Namen, eine Farbe und einen kurzen Schlüssel wie `SCM`; der Schlüssel wird aus dem Namen abgeleitet und lässt sich ändern. Aufgaben in diesem Projekt heißen dann `SCM-1`, `SCM-2` und so weiter. Wähle eine Projektvorlage, falls eine veröffentlicht ist, um mit einem Satz Aufgaben zu starten.

### Aufgabe erledigen

Drücke `⌘K` (`Strg+K` unter Windows und Linux), wähle **Aufgabe erstellen**, tippe einen Titel, wähle das Projekt und bestätige mit `⌘↵`. Status, Priorität, Typ, Verantwortliche, Schätzung und Fälligkeit setzt du im Detailbereich der Aufgabe. Das war's. Du trackst Arbeit.

:::

## Lieber im Terminal?

Dieselbe Aufgabe aus der Shell. Das CLI meldet sich über den Browser an und speichert das Token im Schlüsselbund des Systems.

```bash title="terminal"
trackr login --server https://app.trackr.dev
trackr task create --title "CAD-Modelle für die Messe vorbereiten" \
  --project SCM --priority high --due 2026-09-12
```

Oder direkt gegen die API mit Bearer-Token:

```bash title="create-task.sh"
curl -X POST https://app.trackr.dev/api/v1/tasks \
  -H "Authorization: Bearer $TRACKR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "CAD-Modelle für die Messe vorbereiten", "projectKey": "SCM", "priority": "high" }'
```

> [!NOTE]
> **Woher kommt das Token?**
>
> Das CLI holt bei der Anmeldung ein Sitzungs-Token für dich; für Skripte einmal `trackr login` ausführen und das gespeicherte Token weiterverwenden. Für dauerhafte Automatisierung gibt es persönliche API-Keys (`trk_…`), die als ihr Nutzer handeln. Details in der [Authentifizierungs-Anleitung](/docs/developers/authentication).

## Wie es weitergeht

- Die Objekte, aus denen alles besteht, erklärt [Grundkonzepte](/docs/getting-started/core-concepts).
- Plane deine Woche gegen deine Kapazität in [Meine Woche](/docs/features/my-week).
- Gib Kunden ein eigenes Portal mit [Organisationen](/docs/administration/organizations).

---
title: Support-Tickets
description: Tickets sind eingehende Anfragen von Kunden oder Kollegen. Sie liegen in einer gemeinsamen Queue auf Organisationsebene, bis jemand sie triagiert.
order: 3
updated: 2026-09-10
---

## Die Queue

Die Ticket-Seite zeigt alle für dich sichtbaren Tickets als **Liste** oder **Board**. Gruppiere nach Status, Priorität, Kategorie, Organisation oder Verantwortlichem und filtere nach Status, Priorität, Kategorie, Tags, Verantwortlichem und Organisation. Die Board-Ansicht gruppiert standardmäßig nach Status; den Status selbst änderst du im Ticket. Tickets, die du im Auge behalten willst, lassen sich **anheften**; angeheftete und zuletzt geöffnete Tickets stehen in der Seitenleiste.

Jedes Ticket hat:

- eine **Unterhaltung** aus öffentlichen Nachrichten, sichtbar für den Anfragenden,
- **interne Notizen**, die nur dein Team liest,
- **Anhänge** bis 25 MiB pro Datei und 20 Dateien pro Upload,
- eine **Checkliste**, die alle Beteiligten abhaken können,
- **Verantwortliche**, eine **Priorität**, eine **Kategorie** und **Tags**, gesetzt von deinem Team.

## Das Kundenportal

Mitglieder einer Kundenorganisation melden sich in derselben App an, sehen aber nur das Portal: eine Startseite zum Öffnen eines neuen Tickets, ihre Tickets, ein kleines Dashboard mit den Zahlen für offen, nicht zugewiesen und diese Woche geschlossen sowie den Chat der Organisation mit deinem Team. Deine Projekte, Aufgaben oder das Wiki sehen sie nie.

> [!NOTE]
> **Rollen in einer Kundenorganisation**
>
> **Members** sehen und verfolgen ihre eigenen Tickets. **Clients** sehen jedes Ticket ihrer Organisation. **Agents** können außerdem triagieren und zuweisen. Dein eigenes Team erscheint in der Unterhaltung als Team. Siehe [Rollen &amp; Berechtigungen](/docs/administration/roles-permissions).

## Vom Ticket zur Aufgabe

Braucht ein Ticket Entwicklungsarbeit, wandle es mit **Aufgabe erstellen** (oder `POST /api/v1/tickets/:id/tasks`) in eine Projektaufgabe um. Die Aufgabe behält einen Link zurück zum Ticket, Checklistenpunkte werden übernommen, Anhänge geteilt, und das Ticket zeigt den Status der verknüpften Aufgabe, sodass der Anfragende den Fortschritt sieht, ohne in deinem Aufgabengraphen zu sein.

## Kanäle

Tickets kommen aus dem Portal, der Web-App, aus einem Chat-Thread, der iOS-App, dem CLI, dem MCP-Server und der API. Jeder Kanal erzeugt dasselbe Objekt, die Triage hängt nie davon ab, woher eine Anfrage kam. Jedes Ticket merkt sich seine Herkunft als `web_form`, `chat`, `email` oder `api`; iOS-App, CLI, MCP und REST zählen alle als `api`.

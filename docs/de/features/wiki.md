---
title: Wiki, Notizen & Chat
description: Das Wiki hält die Dokumente, die jede einzelne Aufgabe überdauern. Notizen fangen auf, was dazwischen passiert. Im Chat redet das Team über beides.
order: 4
updated: 2026-09-10
badge: new
---

## Wiki

Das Wiki ist ein Baum aus Ordnern und Seiten für dein internes Team: Onboarding-Guides, Runbooks, Architekturnotizen, Wochenrückblicke. Seiten werden **gemeinsam in Echtzeit** bearbeitet. Mehrere Personen tippen in derselben Seite und sehen die Cursor der anderen.

- `/` öffnet das Slash-Menü: Überschriften, Absätze, Aufzählungen und nummerierte Listen, Aufgabenlisten, Zitate, Codeblöcke, Trennlinien, Bilder und Dateianhänge.
- Markdown-Kürzel funktionieren beim Tippen, eingefügtes Markdown wird umgewandelt.
- Seiten lassen sich im Baum zwischen Ordnern verschieben oder umsortieren.

Unter der Haube sind Seiten CRDT-Dokumente (Yjs). Die Web-App pflegt ein HTML-Lesemodell für Suche und API, sodass iOS-App und MCP-Clients jede Seite lesen können, ohne das Editorformat zu kennen. Bearbeitet wird in der Web-App.

## Notizen

Notizen sind leichter als Wiki-Seiten und kommen in zwei Arten.

- **Schnellnotizen** sind ein persönlicher Notizblock, nur für die Besitzerin oder den Besitzer sichtbar. Erfasse sie in der Web-App, in der iOS-App oder über das Tool `create_note` des MCP-Servers.
- **Meeting-Notizen** folgen einer Vorlage und sind immer mit einem Projekt oder einer Aufgabe verknüpft. Wer das Projekt sieht, kann sie lesen.
- Jede Notiz kann als Vorlage für die nächste gespeichert werden.
- Wem eine Notiz gehört, kann **Freigabelinks** zum Lesen oder Schreiben für Teammitglieder erzeugen, die noch keinen Zugriff haben. Die Links funktionieren nur für Mitglieder des internen Teams.

> [!TIP]
> **Aufgabe ↔ Meeting**
>
> Die Detailansicht einer Aufgabe listet die Meetings, in denen sie besprochen wurde. Das „Warum“ hinter einer Aufgabe ist einen Klick entfernt.

## Chat

Chat ist in **Threads** pro Organisation organisiert. Threads tragen Tags; ein Tag lässt sich abonnieren, um über jeden Thread damit benachrichtigt zu werden, oder stummschalten, wenn er dich nicht interessiert. Aus einem Thread lässt sich ein Ticket machen, wenn eine Unterhaltung sich als Anfrage entpuppt. Nachrichten unterstützen `@`-Erwähnungen.

Chat-Ereignisse gibt es auch als [Webhooks](/docs/developers/webhooks) (sie sind hochvolumig, also bewusst ankreuzen).

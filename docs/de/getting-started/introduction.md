---
title: Willkommen bei Trackr
description: Trackr ist ein schneller, tastaturzentrierter Workspace, der Aufgaben, Support-Tickets, Wochenplanung, Chat, Notizen und das Team-Wiki hinter einem Tastaturkürzel vereint — gebaut für kleine Teams mit echten Projekten über mehrere Organisationen hinweg.
order: 1
updated: 2026-09-10
---

## Einführung

Die meisten Teams flicken fünf Tools zusammen, die nicht miteinander reden: einen Tracker, eine Ticket-Queue, einen Planungskalender, eine Docs-App und eine Tabelle dafür, wer was darf. Trackr fasst all das in einem Workspace zusammen, in dem die Daten verbunden bleiben und die Befehlspalette alles erreicht.

Diese Anleitung führt dich von der frischen Instanz zum laufenden Projekt: Organisation prüfen, Team einladen, Rollen einrichten und die erste Aufgabe abschließen. Wer lieber direkt loslegt, drückt in der App überall `⌘K`, um zu allem zu springen.

> [!TIP]
> **Neu bei Work-Trackern?**
>
> Beginne mit dem [Schnellstart](/docs/getting-started/quickstart). In unter zwei Minuten hast du ein Projekt mit echten Aufgaben, ganz ohne Konfiguration.

> [!NOTE]
> **Trackr ist in aktiver Entwicklung**
>
> Die hier dokumentierten Funktionen und Endpunkte entsprechen dem aktuellen Build. Alles, was als *Beta* markiert ist, kann sich noch ändern; das [Changelog](/changelog) listet jede sichtbare Änderung.

## Was du damit baust

::::cards

:::card{title="Projekt-Tracking" href="/docs/features/tasks" icon="square-check"}
Listen- oder Board-Ansicht, gruppiert nach Projekt, Status, Verantwortlichem oder Priorität. Immer synchron.
:::

:::card{title="Kapazitätsplanung" href="/docs/features/my-week" icon="calendar-days"}
Aufgaben auf Tage legen, ein Wochenlimit setzen und Überlastung sehen, bevor sie passiert.
:::

:::card{title="Support-Eingang" href="/docs/features/tickets" icon="life-buoy"}
Eine gemeinsame Ticket-Queue mit Kundenportal. Ein Ticket wird mit einem Tastendruck zur Aufgabe.
:::

:::card{title="Team-Wiki & Notizen" href="/docs/features/wiki" icon="book-open"}
Langlebige Dokumente und Runbooks mit Echtzeit-Zusammenarbeit.
:::

:::card{title="CLI & TUI" href="/docs/developers/cli" icon="terminal"}
Aufgaben anlegen, Tickets triagieren und den Posteingang lesen — aus dem Terminal.
:::

:::card{title="iOS-App" href="/docs/apps/ios" icon="smartphone"}
Der reaktive Teil von Trackr auf dem Handy: abhaken, schnell anlegen, antworten, Zeit erfassen.
:::

::::

## Wie die Teile zusammenspielen

Trackr ist ein Repository mit vier auslieferbaren Teilen, die sich gemeinsam weiterentwickeln:

| Teil          | Aufgabe                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Web-App**   | Der Produktkern. Besitzt das Datenbankschema, die HTTP-API und den Collaboration-Server. |
| **Worker**    | Arbeitet die Job-Queue ab: E-Mails, Webhooks, Push, Digests, Aufräumen.                  |
| **Scheduler** | Legt wiederkehrende Jobs nach Zeitplan in die Queue. Arbeitet nie selbst.                |
| **Clients**   | Das `trackr`-CLI und die native iOS-App, beide über dieselbe `/api/v1`.                  |

Das ganze System läuft auf **Postgres, einer Bun-basierten Web-App und zwei Go-Binaries**. Es gibt keinen Message-Broker und keinen separaten Echtzeit-Dienst: Die Queue ist eine Tabelle, und das gemeinsame Bearbeiten läuft im Web-Prozess. Das vollständige Bild zeigt [Self-Hosting](/docs/self-hosting/docker).

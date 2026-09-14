---
title: Grundkonzepte
description: Eine Handvoll Objekte bildet alles in Trackr. Wer versteht, wie sie ineinander stecken, versteht den Rest des Produkts von selbst.
order: 3
updated: 2026-09-10
---

## Das Objektmodell

| Objekt           | Was es ist                                                                                                                                         | Gehört zu                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Organisation** | Oberster Container für ein Team oder einen Kunden. Enthält Mitglieder und Tickets. Eine Organisation ist als _intern_ markiert: dein eigenes Team. | Instanz                         |
| **Projekt**      | Ein Arbeitspaket mit eigenem Schlüssel, Farbe, Status, Lead und Mitgliedern. Interne Projekte gehören keinem Kunden.                               | Organisation oder intern        |
| **Aufgabe**      | Eine Arbeitseinheit: Titel, Status, Priorität, Typ, Verantwortliche, Schätzung, Fälligkeit, Checkliste, Unteraufgaben.                             | Projekt                         |
| **Ticket**       | Eine eingehende Anfrage von Kunde oder Kollege, die zur Aufgabe werden kann.                                                                       | Organisation                    |
| **Thread**       | Eine Chat-Unterhaltung innerhalb einer Organisation, mit Tags und Abonnements.                                                                     | Organisation                    |
| **Wiki-Seite**   | Ein langlebiges, gemeinsam bearbeitetes Dokument im Ordnerbaum.                                                                                    | Internes Team                   |
| **Notiz**        | Eine private Schnellnotiz oder eine Meeting-Notiz, die mit einem Projekt oder einer Aufgabe verknüpft ist.                                         | Nutzer bzw. verknüpftes Projekt |

Weil all das ein Datenmodell teilt, kann ein Ticket zur Aufgabe werden, ein Chat-Thread ein Ticket erzeugen und eine Meeting-Notiz die Aufgaben verknüpfen, die sie bespricht — ohne Export oder Copy-Paste.

## Internes Team und Kundenorganisationen

Trackr unterscheidet zwischen **deinem Team** und **deinen Kunden**:

- Die **interne Organisation** ist deine Firma. Ihre Mitglieder sehen jedes Projekt, jedes Ticket, Wiki, Chat und Notizen.
- **Kundenorganisationen** bekommen ein abgegrenztes Portal: Ihre Mitglieder können Tickets öffnen und verfolgen und im Chat der Organisation mit deinem Team reden, und sonst nichts. Ein Kundenmitglied, das zu einem Projekt hinzugefügt wird, sieht auch dieses Projekt.

Ein Konto kann zu vielen Organisationen gehören. Internes Team sieht alle zugleich; Portal-Nutzer wechseln in der Portal-Seitenleiste zwischen ihnen.

## Status, Prioritäten und Typen

Aufgaben tragen einen kleinen, festen Satz strukturierter Eigenschaften, damit du ohne Custom Fields gruppieren und filtern kannst.

| Eigenschaft  | Werte                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`     | `backlog` · `todo` · `in_progress` · `paused` · `in_review` · `done`                                                                                               |
| `priority`   | `none` · `low` · `medium` · `high` · `urgent`                                                                                                                      |
| `type`       | `task` · `bug` · `improvement` · `feature` · `chore`                                                                                                               |
| `estimate`   | Minuten. Fließt in die Kapazität von Meine Woche ein.                                                                                                              |
| `due`        | Ein Kalenderdatum.                                                                                                                                                 |
| `plannedFor` | Der Tag, auf dem die Aufgabe in Meine Woche geplant ist. Pro Person gesetzt, dieselbe Aufgabe kann also bei verschiedenen Personen auf verschiedenen Tagen liegen. |

Tickets haben einen eigenen Lebenszyklus:

| Eigenschaft | Werte                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `status`    | `open` · `in_progress` · `waiting_on_customer` · `waiting_on_agent` · `paused` · `resolved` · `closed` |
| `priority`  | `low` · `medium` · `high` · `urgent`                                                                   |
| `category`  | `general` · `billing` · `technical_issue` · `feature_request`                                          |

## Referenzen

Jede Aufgabe und jedes Ticket hat eine lesbare Referenz aus Projektschlüssel bzw. Organisationsschlüssel, etwa `SCM-12` oder `ACME-7`. Referenzen funktionieren in der Befehlspalette, im CLI, im MCP-Server und in der API.

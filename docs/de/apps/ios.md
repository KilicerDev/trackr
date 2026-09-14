---
title: iOS-App
description: Eine native SwiftUI-App für den reaktiven Teil von Trackr — lesen, abhaken, schnell anlegen, antworten, Zeit erfassen — mit Live Activities für Arbeitssitzungen.
order: 1
updated: 2026-09-10
---

## Was sie kann

Die iOS-App ist für die Momente zwischen den Schreibtischen gebaut: Meine Woche im Zug prüfen, eine Aufgabe abhaken, auf ein Ticket antworten, die gerade verbrachte Stunde buchen, eine Schnellnotiz festhalten. Sie spricht dieselbe `/api/v1` wie das CLI, alles vom Handy ist sofort auf dem Desktop sichtbar und umgekehrt.

- Reiter für **Home, Tickets, Aufgaben, Meine Woche und Suche**; **Projekte, Notizen, Meetings, Wiki, Chat und Posteingang** öffnen sich von Home aus
- Aufgaben und Tickets anlegen, kommentieren, antworten, Chat-Threads starten, Aufgaben auf Tage planen, Zeit buchen, Fotos aus der Kamera anhängen
- Gespeicherte Ansichten synchron mit der Web-App
- **Arbeitssitzungen** mit Live Activity auf dem Sperrbildschirm und in der Dynamic Island
- Push-Benachrichtigungen, die deine Posteingangs-Einstellungen spiegeln

> [!NOTE]
> **Bewusst unvollständig**
>
> Das Strukturieren von Arbeit bleibt Desktop-Sache: Boards, Massenänderungen, Projekteinrichtung und Wiki-Editieren sind nicht in der App. Die App liest Wiki-Seiten und nimmt am Chat teil, für den Rest willst du eine Tastatur.

## Mit deiner Instanz verbinden

Beim ersten Start fragt die App nach einer Server-URL, prüft `/api/v1/instance` und öffnet die Anmeldeseite in einem In-App-Browser. Das Token kommt über das URL-Schema der App (`dev.kilicer.trackr://`) zurück und wird im iOS-Schlüsselbund gespeichert. Selbst gehostete Instanzen funktionieren genau wie die gehostete.

## Verfügbarkeit

Die App wird während der Beta per TestFlight an das Team verteilt. Die öffentliche Verfügbarkeit wird im [Changelog](/changelog) angekündigt.

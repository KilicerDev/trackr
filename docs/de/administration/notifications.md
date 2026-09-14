---
title: Benachrichtigungen & E-Mail
description: Jedes Ereignis kann Personen über den In-App-Posteingang, E-Mail und Push erreichen. Jede Person entscheidet, wie sie von welchem Ereignis erfahren will.
order: 3
updated: 2026-09-10
---

## Kanäle

| Kanal           | Zugestellt durch                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Posteingang** | Sofort, in der App und über `GET /api/v1/inbox`. Die Glocke zeigt die ungelesene Anzahl.                                              |
| **E-Mail**      | Den Worker, über deinen SMTP-Server. Pro Empfänger in dessen Sprache gerendert.                                                       |
| **Push**        | Den Worker, über APNs, an Geräte, die die iOS-App registriert hat. Push spiegelt den Posteingang: Was dort landet, wird auch gepusht. |

## Einstellungen

Unter **Einstellungen** stellt jede Person jedes Ereignis zweifach ein: ob es im **Posteingang** landet (an oder aus) und wie es per **E-Mail** kommt (aus, sofort oder gebündelt im Digest). Ereignisse gibt es für Aufgaben (zugewiesen, erwähnt, kommentiert, Status geändert, bald fällig), Tickets (erstellt, zugewiesen, Status geändert, neue Nachricht, erwähnt), Chat (neue Nachricht, erwähnt), Projekt-Erwähnungen und Wiki-Änderungen.

- Der **Digest** läuft stündlich oder täglich zu einer gewählten Stunde und bündelt alle Ereignisse, die du auf _Digest_ gestellt hast.
- **Ruhezeiten** pausieren sofortige E-Mails: Was sonst sofort gesendet würde, wartet auf den nächsten Digest. Posteingang und Push sind davon nicht betroffen.
- Wer in einer Organisation alles sieht, kann einen Bereich zusätzlich auf _Beteiligung_ oder _nur Erwähnungen_ eingrenzen.

## Für Administratoren

- E-Mails werden als Jobs verschickt (`mail.send`). Ist `SMTP_HOST` leer, protokolliert der Worker die E-Mail statt sie zu senden — praktisch in der Entwicklung.
- **Admin → System → Jobs** (Superadmins) zeigt die letzten 50 Jobs aller Typen und erlaubt Test-E-Mails sowie das Stoppen oder Wiederholen von Jobs.
- Gelesene Benachrichtigungen, die älter als 90 Tage sind, und Einladungen, die älter als 7 Tage sind, werden nach einem Zeitplan bereinigt, den du unter **Admin → System → Zeitpläne** siehst.

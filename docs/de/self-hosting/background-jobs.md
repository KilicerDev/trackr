---
title: Hintergrund-Jobs
description: E-Mails, Webhooks, Push und Aufräumen laufen außerhalb des Request-Pfads über eine Postgres-Queue, die der Go-Worker abarbeitet.
order: 3
updated: 2026-09-10
---

## So funktioniert die Queue

Die Web-App schreibt eine Zeile in die Tabelle `jobs`. Der Worker beansprucht Zeilen mit `SELECT … FOR UPDATE SKIP LOCKED`, führt den Handler aus und protokolliert das Ergebnis. Ein Postgres-`LISTEN/NOTIFY`-Trigger weckt den Worker in dem Moment, in dem ein Job eingefügt wird oder wieder beanspruchbar ist, sodass die Latenz bei Millisekunden liegt; ein Poll-Intervall fängt alles Verpasste ab.

Lebenszyklus: `queued → running → succeeded | failed (Wiederholung mit Backoff) | cancelled`. Jeder laufende Job sendet Heartbeats; ein Reaper reiht Jobs neu ein, deren Worker gestorben ist, solange sie noch Versuche übrig haben (standardmäßig fünf), und markiert den Rest als fehlgeschlagen.

## Job-Typen

| Typ                                                                               | Zweck                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `mail.send`                                                                       | Transaktionale E-Mail.                                                                             |
| `webhook.deliver`                                                                 | Ein Webhook-Zustellversuch. Wiederholungen werden als neue Jobs eingeplant.                        |
| `push.send`                                                                       | APNs-Push an registrierte Geräte.                                                                  |
| `notify.digest`                                                                   | Läuft alle 15 Minuten und leert das stündliche oder tägliche Digest-Fenster jedes Nutzers.         |
| `prune.jobs` `prune.invitations` `prune.notifications` `prune.webhook_deliveries` | Aufbewahrung: 30 Tage, 7 Tage, 90 Tage (gelesene Benachrichtigungen) und 30 Tage, täglich geprüft. |

## Zeitpläne

Der Scheduler liest alle paar Sekunden die Tabelle `schedules`, reiht pro fälliger Zeile einen Job ein und schiebt `next_run_at` um das Intervall der Zeile weiter. Er reiht nur ein; die Arbeit macht der Worker. Zeitpläne sind einfache Zeilen: per SQL pausieren, anpassen oder ergänzen, oder unter **Admin → System → Zeitpläne** aktivieren und pausieren.

## Monitoring

**Admin → System → Jobs** zeigt die letzten 50 Jobs mit Typ, Zustand, Versuchen und Fehler sowie Aktionen zum Senden einer Test-E-Mail, Stoppen eines eingereihten oder laufenden Jobs oder Wiederholen eines beendeten. Beide Seiten sind Superadmins vorbehalten. Beide Go-Dienste loggen strukturierte key=value-Zeilen nach stderr; richte deinen Log-Shipper auf die Container.

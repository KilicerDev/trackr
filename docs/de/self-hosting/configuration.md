---
title: Konfiguration
description: Jede Stellschraube ist eine Umgebungsvariable in der .env im Repo-Root, gelesen von Docker Compose, der Web-App und den Go-Diensten.
order: 2
updated: 2026-09-10
---

> [!WARNING]
> **Unter Compose zählen nur weitergereichte Variablen**
>
> Die Compose-Datei übergibt jedem Container eine feste Liste von Variablen. Variablen, die unten als *nicht weitergereicht* markiert sind, müssen erst in den `environment`-Block des Dienstes (oder einen `env_file`-Eintrag), bevor sie wirken. Siehe [Docker Compose](/docs/self-hosting/docker).

## Datenbank

| Variable                        | Standard           | Hinweis                                                                                                                                                                                         |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | —                  | Vollständiger Connection-String. Unter Compose leer lassen, dann wird er aus den Teilen unten gebaut; `.env.example` bringt einen Wert für die lokale Entwicklung mit, der geleert werden muss. |
| `POSTGRES_USER`                 | `app`              | Compose provisioniert den `db`-Dienst daraus.                                                                                                                                                   |
| `POSTGRES_PASSWORD`             | —                  | **Pflicht.**                                                                                                                                                                                    |
| `POSTGRES_DB`                   | `trackr`           |                                                                                                                                                                                                 |
| `POSTGRES_HOST` `POSTGRES_PORT` | `localhost` `5432` | Compose setzt den Host auf `db`. Unter Compose ändert `POSTGRES_PORT` nur den auf dem Host veröffentlichten Port; die Container nutzen immer 5432.                                              |

## Routing und Auth

| Variable                        | Standard                               | Hinweis                                                    |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `ORIGIN`                        | ungesetzt                              | Hinter einem Proxy mit Forwarded-Headern ungesetzt lassen. |
| `PROTOCOL_HEADER` `HOST_HEADER` | `x-forwarded-proto` `x-forwarded-host` | Header-Namen, denen die App vertraut.                      |
| `XFF_DEPTH`                     | `1`                                    | Anzahl der Proxies davor.                                  |
| `BETTER_AUTH_SECRET`            | —                                      | **Pflicht.** 32+ Zeichen.                                  |
| `ROOT_EMAIL` `ROOT_NAME`        | `root@example.com` `Root`              | Angelegtes Superadmin-Konto.                               |
| `ROOT_PASSWORD`                 | —                                      | **Pflicht beim ersten Start.** 8+ Zeichen.                 |

## E-Mail

Gelesen vom Worker.

| Variable                | Standard                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `EMAIL_FROM`            | — (Pflicht, sobald `SMTP_HOST` gesetzt ist)                |
| `SMTP_HOST`             | leer = in die Konsole loggen                               |
| `SMTP_PORT`             | `587`                                                      |
| `SMTP_SECURE`           | `true` bei `SMTP_PORT` 465, sonst `false`                  |
| `SMTP_USER` `SMTP_PASS` | —                                                          |
| `DIGEST_TZ`             | `Europe/Berlin` (Web-App und Worker; nicht weitergereicht) |

## Speicher

Die `STORAGE_*`- und `S3_*`-Variablen stehen unter [Docker Compose → Speicher](/docs/self-hosting/docker#speicher). Die `S3_*`-Variablen werden von der ausgelieferten Compose-Datei nicht weitergereicht.

## Worker

| Variable                                   | Standard    | Hinweis                                                                                                                                                                         |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_CONCURRENCY`                       | `4`         | Parallele Jobs pro Worker.                                                                                                                                                      |
| `WORKER_JOB_TIMEOUT`                       | `4m`        | Frist pro Job. Muss kürzer sein als `WORKER_REAP_AFTER`.                                                                                                                        |
| `WORKER_POLL_INTERVAL`                     | `1s`        | Fallback-Polling; `LISTEN/NOTIFY` weckt sofort.                                                                                                                                 |
| `WORKER_NOTIFY`                            | `true`      | `false` deaktiviert `LISTEN/NOTIFY`, etwa hinter einem Pooler im Transaction-Modus.                                                                                             |
| `WORKER_HEARTBEAT` `WORKER_REAP_AFTER`     | `30s` `5m`  | Hängende Jobs werden nach dem Reap-Fenster neu eingereiht, solange Versuche übrig sind, sonst als fehlgeschlagen markiert. Der Heartbeat muss kürzer sein als das Reap-Fenster. |
| `WORKER_BACKOFF_BASE` `WORKER_BACKOFF_CAP` | `10s` `10m` | Exponentielles Backoff.                                                                                                                                                         |
| `WORKER_JOB_TYPES`                         | alle        | Kommagetrennte Liste, um einen Worker auf Job-Typen festzulegen.                                                                                                                |
| `WORKER_ID`                                | Hostname    | Erscheint in den Log-Zeilen des Workers. Nicht weitergereicht.                                                                                                                  |

## Scheduler

| Variable                  | Standard | Hinweis               |
| ------------------------- | -------- | --------------------- |
| `SCHEDULER_POLL_INTERVAL` | `5s`     |                       |
| `SCHEDULER_BATCH_SIZE`    | `100`    |                       |
| `SCHEDULER_ID`            | Hostname | Nicht weitergereicht. |

## Webhooks und Push

| Variable                                                 | Standard     | Hinweis                                                                                                                                              |
| -------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOKS_ENABLED`                                       | `true`       | Web-App. Nicht weitergereicht.                                                                                                                       |
| `WEBHOOK_TIMEOUT`                                        | `10s`        | Worker. Nicht weitergereicht.                                                                                                                        |
| `WEBHOOK_MAX_BODY`                                       | `2048`       | Bytes des Antwort-Bodys, die pro Zustellversuch gespeichert werden. Worker. Nicht weitergereicht.                                                    |
| `WEBHOOK_ALLOW_PRIVATE_URLS`                             | `false`      | Nur für die Entwicklung; erlaubt auch reines `http://`. Web-App und Worker. Nicht weitergereicht.                                                    |
| `PUSH_ENABLED`                                           | `false`      | Lässt die Web-App `push.send`-Jobs einreihen. Die Zustellung braucht zusätzlich die `APNS_*`-Werte im Worker; ohne sie werden die Jobs übersprungen. |
| `APNS_KEY` `APNS_KEY_ID` `APNS_TEAM_ID` `APNS_BUNDLE_ID` | —            | APNs-Zugangsdaten für die iOS-App. `APNS_KEY` akzeptiert PEM-Inhalt, einen Dateipfad oder Base64.                                                    |
| `APNS_ENV`                                               | `production` | `development` für Sandbox-Pushes.                                                                                                                    |

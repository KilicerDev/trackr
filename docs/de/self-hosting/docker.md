---
title: Docker Compose
description: Betreibe dein eigenes Trackr mit Postgres, einem SMTP-Server und optionalem Objektspeicher. Eine Compose-Datei, vier Container, kein Message-Broker.
order: 1
updated: 2026-09-10
---

## Was du bekommst

| Dienst      | Image                                              | Rolle                                                                                           |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `db`        | `postgres:16-alpine`                               | Daten plus Job-Queue. Nur auf `127.0.0.1:5432` veröffentlicht.                                  |
| `app`       | gebaut aus `./web`                                 | Web-App, API und Collaboration-Server auf Port `3000`. Kein Host-Port; ein Reverse-Proxy davor. |
| `worker`    | gebaut aus `./services` mit `worker/Dockerfile`    | E-Mails, Webhooks, Push, Digests, Aufräumen.                                                    |
| `scheduler` | gebaut aus `./services` mit `scheduler/Dockerfile` | Legt wiederkehrende Jobs in die Queue.                                                          |

Die beiden Go-Dienste teilen sich den Build-Kontext `./services`, weil sie dieselben `shared/`-Pakete kompilieren. Anhänge landen standardmäßig in einem Docker-Volume oder in einem beliebigen S3-kompatiblen Bucket.

## Ausrollen

:::steps

### Klonen und konfigurieren

```sh
git clone https://github.com/KilicerDev/trackr.git && cd trackr
cp .env.example .env
```

Trage `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (32+ zufällige Zeichen) und `ROOT_PASSWORD` (8+ Zeichen) ein. Ändere dann zwei Werte, die das Beispiel für die lokale Entwicklung mitbringt: Setze `DATABASE_URL` auf leer, damit die Container den Connection-String aus den `POSTGRES_*`-Teilen bauen und den Dienst `db` erreichen, und setze `STORAGE_DRIVER=local`, sofern du kein S3 konfigurierst (siehe unten). Alles andere hat einen sinnvollen Standard.

### Starten

```sh
docker compose up -d --build
```

Der App-Container führt bei jedem Start Migrationen aus und legt das Root-Konto an; beides ist idempotent. Eine fehlschlagende Migration bricht den Start ab.

### Proxy davorschalten

Zeige mit deinem Reverse-Proxy auf `app:3000` und reiche `X-Forwarded-Proto` und `X-Forwarded-Host` weiter. Lass `ORIGIN` ungesetzt, damit Trackr seine öffentliche URL aus diesen Headern ableitet.

### Anmelden

Öffne deine Domain und melde dich mit dem Root-Konto an. Deine interne Organisation existiert bereits und das Root-Konto ist Mitglied; lade das Team unter **Admin → Verzeichnis → Nutzer** ein.

:::

> [!NOTE]
> **Secret erzeugen**
>
> Erzeuge `BETTER_AUTH_SECRET` mit `openssl rand -base64 32`.

> [!WARNING]
> **Compose reicht eine feste Liste von Variablen weiter**
>
> Die Compose-Datei hat kein `env_file`. Jeder Dienst bekommt nur die Variablen, die in seinem `environment`-Block stehen; alles andere in der `.env` wird ignoriert. Im Auslieferungszustand werden `S3_*`, `WEBHOOKS_ENABLED`, `WEBHOOK_ALLOW_PRIVATE_URLS`, `WEBHOOK_TIMEOUT`, `WEBHOOK_MAX_BODY`, `WORKER_ID`, `SCHEDULER_ID` und `DIGEST_TZ` nicht weitergereicht. Um sie zu nutzen, trage sie in den `environment`-Block des jeweiligen Dienstes in `docker-compose.yaml` ein oder ergänze bei jedem Dienst `env_file: .env`.

## E-Mail

Setze `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` und `EMAIL_FROM`. Ist `SMTP_HOST` leer, protokolliert der Worker E-Mails statt sie zu senden — nützlich für den ersten Lauf. Sobald `SMTP_HOST` gesetzt ist, wird `EMAIL_FROM` Pflicht; ohne startet der Worker nicht. `SMTP_SECURE` ist auf Port 465 standardmäßig `true`, sonst `false`.

## Speicher

```ini title=".env"
STORAGE_DRIVER=local          # oder s3
# S3-kompatibel (in docker-compose.yaml weiterreichen!)
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
S3_REGION=eu-central-1        # Standard us-east-1
S3_BUCKET=trackr-attachments  # Pflicht bei STORAGE_DRIVER=s3
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true      # Standard true, sobald S3_ENDPOINT gesetzt ist
BODY_SIZE_LIMIT=100M
```

Beim lokalen Treiber hängt Compose das Volume `uploads` unter `/app/data/attachments` in den `app`-Container; der Pfad ist in der Compose-Datei fest verdrahtet.

## Aktualisieren

```bash
git pull
docker compose up -d --build
```

Migrationen laufen beim Start automatisch. Die Go-Dienste migrieren nie; das Schema gehört der Web-App.

## Skalierung

- `worker` und `scheduler` laufen mit beliebig vielen Replikas; die Queue nutzt Zeilensperren, ein Job wird nie von zwei Workern zugleich beansprucht. Die Zustellung ist at-least-once: Ein Job, dessen Worker stirbt, wird vom Reaper neu eingereiht, die Handler sind deshalb idempotent.
- Live-Update-Stream, Berechtigungs-Cache und Collaboration-Server der Web-App sind Einzelprozess. Betreibe eine `app`-Replika.

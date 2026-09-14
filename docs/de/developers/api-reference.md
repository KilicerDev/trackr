---
title: API-Referenz
description: Die Trackr-API ist REST über HTTPS mit JSON-Bodies unter /api/v1 deiner Instanz. Es ist dieselbe API, die iOS-App und CLI verwenden.
order: 2
updated: 2026-09-10
---

## Konventionen

- Basis-URL: `https://<deine-instanz>/api/v1` (für das gehostete Produkt `https://app.trackr.dev/api/v1`).
- Authentifizierung: `Authorization: Bearer <token>`. Siehe [Authentifizierung](/docs/developers/authentication).
- Bodies und Antworten sind JSON. Daten sind ISO-8601-Strings; Kalendertage wie `plannedFor` und das `date` eines Zeiteintrags sind `YYYY-MM-DD`.
- Endpunkte, die Aufgaben, Tickets, Kommentare, Nachrichten und Threads anlegen, akzeptieren auch `multipart/form-data` mit einem Feld `payload` für das JSON und einem oder mehreren `attachments`-Dateiteilen.
- Fehler liefern ein JSON-Objekt mit `message` und einem HTTP-Status: `400` ungültige Eingabe, `401` keine Sitzung, `403` keine Berechtigung, `404` nicht gefunden oder nicht sichtbar.
- Jeder Endpunkt setzt dieselben Berechtigungen durch wie die Web-App.

```bash title="list-my-tasks.sh"
curl "https://app.trackr.dev/api/v1/tasks?scope=mine" \
  -H "Authorization: Bearer $TRACKR_TOKEN"
```

```json title="response"
{
	"tasks": [
		{
			"id": "SCM-1",
			"uuid": "7a4d…",
			"title": "CAD-Modelle für die Messe vorbereiten",
			"status": "todo",
			"priority": "high",
			"type": "task",
			"estimate": 360,
			"due": "2026-09-12",
			"project": "3b9a…",
			"assignees": ["9c1e…"]
		}
	],
	"users": { "9c1e…": { "name": "Ertugul Kilic", "color": "#ff4867" } }
}
```

In Listenzeilen ist `id` die lesbare Referenz und `uuid` die Datenbank-ID; verwende die `uuid`, wo ein Pfad `:id` erwartet. Verantwortliche sind Nutzer-IDs; die `users`-Map liefert ihre Anzeigenamen.

## Sitzung

| Methode       | Pfad              | Beschreibung                                                                                                   |
| ------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET`         | `/instance`       | Unauthentifizierte Prüfung. Liefert `{ name, version, api, branding }`.                                        |
| `GET`         | `/me`             | `{ user, capabilities, orgs, unreadCount, instances }`.                                                        |
| `GET` `PATCH` | `/me/preferences` | Aufgelöste Einstellungen als `{ preferences }`. `PATCH` merged ein Teilobjekt.                                 |
| `PATCH`       | `/me/profile`     | `name` und `image` ändern.                                                                                     |
| `GET` `POST`  | `/me/views`       | Gespeicherte Ansichten pro Seite, geteilt mit der Web-App. `POST`-Body `{ key, patch }`.                       |
| `GET`         | `/events`         | Server-Sent-Events-Stream mit Invalidierungshinweisen (`entity`, `inbox`).                                     |
| `GET`         | `/search?q=`      | Globale Suche über Tickets, Aufgaben, Projekte, Wiki und Notizen als `{ results }`. Optional `types`, `orgId`. |

## Posteingang

| Methode | Pfad           | Beschreibung                                                           |
| ------- | -------------- | ---------------------------------------------------------------------- |
| `GET`   | `/inbox`       | Cursor-paginierter Feed. Optional `limit` (≤ 100) und `filter=unread`. |
| `GET`   | `/inbox/badge` | Nur die ungelesene Anzahl, als `{ unread }`.                           |
| `POST`  | `/inbox/read`  | Body `{ all: true }`, `{ id }` oder `{ entityType, entityId }`.        |

## Aufgaben

| Methode  | Pfad                     | Beschreibung                                                                                                                                                                                |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/tasks?scope=mine\|all` | Aufgaben als `{ tasks, users }` auflisten. Standard-Scope `mine`.                                                                                                                           |
| `POST`   | `/tasks`                 | Anlegen. Body: `title`, `projectKey`, `description`, `status`, `priority`, `type`, `due`, `estimate`, `tags`, `assigneeIds`, `dependsOnIds`, `plannedFor`. Liefert `201 { id, displayId }`. |
| `GET`    | `/tasks/:id`             | `{ task, attachments, authors, assignableUsers, canEdit, canComment }`.                                                                                                                     |
| `PATCH`  | `/tasks/:id`             | Beliebiges editierbares Feld ändern, auch `checklist` und `dependsOnIds`.                                                                                                                   |
| `DELETE` | `/tasks/:id`             | Löschen (braucht `project.tasks.delete.any`).                                                                                                                                               |
| `POST`   | `/tasks/:id/comments`    | Kommentar hinzufügen: `{ body }`.                                                                                                                                                           |
| `POST`   | `/tasks/:id/time`        | Zeit buchen: `{ minutes, date, note }`.                                                                                                                                                     |

## Tickets

| Methode  | Pfad                                          | Beschreibung                                                                                                                                   |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/tickets?segment=mine\|watched\|all&status=` | Tickets nach letzter Aktivität.                                                                                                                |
| `POST`   | `/tickets`                                    | Anlegen: `{ orgId, subject, description? }`; Agents dürfen auch `priority`, `category`, `assigneeIds` setzen. Liefert `201 { id, displayId }`. |
| `GET`    | `/tickets/:id`                                | Detail mit vollständigem Nachrichtenverlauf, Anhängen, `linkedTasks` und `canInternalNote`.                                                    |
| `PATCH`  | `/tickets/:id`                                | Nur Agents: `status`, `priority`, `category`, `assigneeIds`, `tags`.                                                                           |
| `DELETE` | `/tickets/:id`                                | Löschen.                                                                                                                                       |
| `POST`   | `/tickets/:id/messages`                       | Öffentliche Antwort, oder `{ internal: true }` für eine Team-Notiz.                                                                            |
| `PUT`    | `/tickets/:id/checklist`                      | Gesamte Checkliste ersetzen.                                                                                                                   |
| `POST`   | `/tickets/:id/tasks`                          | In eine verknüpfte Projektaufgabe umwandeln (nur Team).                                                                                        |

## Projekte

| Methode      | Pfad                     | Beschreibung                                                                                      |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `GET`        | `/projects`              | Sichtbare Projekte.                                                                               |
| `GET`        | `/projects/:id`          | Projektzusammenfassung.                                                                           |
| `GET` `POST` | `/projects/:id/activity` | Verlauf als Klartext, geblättert per `offset`; `POST { body }` fügt einen Projektkommentar hinzu. |

## Chat, Notizen, Wiki

| Methode      | Pfad                         | Beschreibung                                                                                                  |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET` `POST` | `/chat/threads?orgId=`       | Thread-Feed mit Tags und ungelesenen IDs; `POST` `{ orgId, title, body }`.                                    |
| `GET`        | `/chat/threads/:id`          | Nachrichten; markiert den Thread als gelesen.                                                                 |
| `POST`       | `/chat/threads/:id/messages` | Antworten.                                                                                                    |
| `POST`       | `/notes`                     | Schnellnotiz: `{ title, body? }` (nur internes Team).                                                         |
| `GET`        | `/notes/list`                | `{ quick, meetings, shared }` (nur internes Team).                                                            |
| `GET`        | `/notes/:id`                 | Notiz lesen (nur internes Team).                                                                              |
| `GET`        | `/wiki`                      | Flacher Baum als `{ pages }`: `id`, `parentId`, `title`, `icon`, `isFolder`, `sortOrder` (nur internes Team). |
| `GET`        | `/wiki/:id`                  | `{ page }` mit gerendertem `bodyHtml` (nur internes Team).                                                    |

## Geräte

| Methode         | Pfad           | Beschreibung                                                                                                                                |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` `DELETE` | `/push/tokens` | Geräte-Token registrieren `{ token, platform, deviceName? }` oder entfernen `{ token }`. `platform`: `ios`, `android`, `ios-live-activity`. |

Mit einer Aufgabe verknüpfte Meeting-Notizen liegen außerhalb von `/api/v1` unter `GET /api/tasks/:uuid/meetings` (nur Sitzungs-Token, internes Team).

> [!NOTE]
> **Live-Updates**
>
> Abonniere `/events` für einen Server-Sent-Events-Stream. Er trägt kleine Invalidierungshinweise statt Payloads; lade die betroffene Entität nach, wenn einer eintrifft. Der Stream sendet alle 25 Sekunden einen Kommentar-Frame als Keep-alive und bittet Clients, nach 3 Sekunden neu zu verbinden.

> [!WARNING]
> **Rate-Limits und OpenAPI**
>
> Es gibt heute kein Rate-Limiting und noch kein veröffentlichtes OpenAPI-Dokument. Beides steht auf der Roadmap. Sei fair: cache `/me`, nutze `/events` statt Polling und blättere den Posteingang mit seinem Cursor. Aufgaben-, Ticket- und Projektlisten sind nicht paginiert.

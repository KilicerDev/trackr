---
title: Webhooks
description: Abonniere Ereignisse, und Trackr sendet einen signierten JSON-Payload per POST an deinen Endpunkt — mit Wiederholungen und automatischer Deaktivierung toter Endpunkte.
order: 3
updated: 2026-09-10
---

## Abonnement anlegen

Superadmins verwalten Abonnements unter **Admin → Einstellungen → Webhooks**. Ein Abonnement hat einen Namen, eine Ziel-URL, eine Menge von Ereignistypen und optionale Filter: Organisationen (inklusive _interne Projekte_ für Arbeit ohne Kunden), Projekte, Verantwortliche und ob interne Ticket-Nachrichten enthalten sind.

Beim Anlegen erhältst du das Signatur-Secret **einmalig**, in der Form `whsec_…`. Danach wird nur noch ein Hinweis angezeigt. Du kannst es jederzeit rotieren.

## Der Payload

```json title="task.status_changed"
{
	"id": "5f0c…",
	"type": "task.status_changed",
	"version": "2026-09-01",
	"createdAt": "2026-09-01T09:24:00Z",
	"organizationId": null,
	"projectId": "3b9a…",
	"actor": { "id": "…", "name": "Ertugul Kilic" },
	"data": {
		"task": {
			"id": "…",
			"ref": "SCM-12",
			"projectId": "3b9a…",
			"title": "…",
			"status": "done",
			"priority": "high",
			"type": "task",
			"assigneeIds": ["…"],
			"dependsOnIds": [],
			"dueDate": "2026-09-12",
			"url": "https://app.trackr.dev/tasks/SCM-12"
		},
		"previousStatus": "in_progress",
		"status": "done"
	}
}
```

IDs sind reine UUIDs. `organizationId` ist bei internen Projekten `null`, `projectId` bei Ereignissen ohne Projekt, und `actor` bei systemerzeugten Ereignissen. Jeder Entitäts-Snapshot trägt eine lesbare `ref` und eine absolute `url`; E-Mail-Adressen von Nutzern sind nie enthalten. Nachrichtentexte werden auf 2000 Zeichen gekürzt. `version` ist die Version des Envelopes; sie ändert sich nur, wenn sich die Struktur ändert.

## Header und Signatur

| Header               | Inhalt                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| `X-Trackr-Event`     | Der Ereignistyp, z. B. `ticket.created`.                                     |
| `X-Trackr-Delivery`  | Eindeutige ID dieser Zustellung. Zum Deduplizieren.                          |
| `X-Trackr-Timestamp` | Unix-Zeit (Sekunden) der Signierung.                                         |
| `X-Trackr-Signature` | `sha256=<hex>`: HMAC-SHA256 über `timestamp + "." + body` mit deinem Secret. |

```typescript title="verify.ts"
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret: string, timestamp: string, body: string, header: string) {
	const expected =
		'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
	const a = Buffer.from(expected);
	const b = Buffer.from(header);
	return a.length === b.length && timingSafeEqual(a, b);
}
```

Lehne Anfragen ab, deren Zeitstempel älter als wenige Minuten ist, um Replays zu verhindern.

## Ereignisse

| Gruppe                | Ereignistypen                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tickets               | `ticket.created` · `ticket.status_changed` · `ticket.assigned` · `ticket.message_created` · `ticket.closed`                                                                                                           |
| Aufgaben              | `task.created` · `task.updated` · `task.status_changed` · `task.assigned` · `task.unassigned` · `task.deleted` · `task.time_logged`                                                                                   |
| Projekte & Mitglieder | `project.created` · `project.archived` · `project.member_added` · `project.member_removed` · `organization.member_added` · `organization.member_removed` · `organization.member_role_changed` · `invitation.accepted` |
| Chat (hochvolumig)    | `thread.created` · `thread.tagged` · `message.created`                                                                                                                                                                |

Ein synthetisches `ping`-Ereignis wird von **Test senden** bei einem aktiven Abonnement verschickt und kann nicht abonniert werden.

## Zustellung, Wiederholung und Deaktivierung

- Zustellungen macht der Worker mit 10 Sekunden Timeout und dem `User-Agent` `Trackr-Webhooks/1`. Jedes `2xx` gilt als Erfolg; Redirects werden nicht gefolgt, ein `3xx` ist also ein Fehlschlag.
- Fehlgeschlagene Zustellungen werden nach **1 min → 5 min → 30 min → 2 h → 12 h** wiederholt (sechs Versuche insgesamt).
- Ein Abonnement wird **automatisch deaktiviert** nach fünf aufeinanderfolgenden erschöpften Zustellungen ohne Erfolg in 72 Stunden. Admins werden benachrichtigt und können es wieder aktivieren.
- Jeder Versuch wird 30 Tage lang protokolliert und lässt sich auf der Abonnementseite prüfen oder **erneut zustellen**. Wird ein Abonnement deaktiviert, werden seine wartenden Zustellungen abgebrochen.

> [!WARNING]
> **Nur öffentliche HTTPS-Endpunkte**
>
> Ziele müssen `https://` sein, dürfen keine Zugangsdaten in der URL tragen und müssen auf eine öffentliche IP auflösen. Private Bereiche werden beim Speichern des Abonnements und erneut beim Verbinden durch den Worker abgelehnt, um Server-Side Request Forgery zu verhindern. Self-Hoster können für die Entwicklung `WEBHOOK_ALLOW_PRIVATE_URLS=true` setzen, was auch reines `http://` erlaubt.

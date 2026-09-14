---
title: Rollen & Berechtigungen
description: Trackr bringt eingebaute Rollen für dein Team und für Kundenorganisationen mit. Berechtigungen werden bei jeder Anfrage geprüft, in der Web-App wie in der API.
order: 1
updated: 2026-09-10
---

## Zwei Ebenen von Rollen

**Organisationsrollen** werden pro Mitgliedschaft vergeben und unterscheiden sich zwischen interner und Kundenorganisation:

| Organisation | Rollen                                       |
| ------------ | -------------------------------------------- |
| Intern       | `org.superadmin` · `org.admin` · `org.staff` |
| Kunde        | `org.agent` · `org.client` · `org.member`    |

**Kontorollen** leiten sich aus der Rolle einer Person in der internen Organisation ab und steuern den Zugang zur Administration:

| Rolle        | Abgeleitet aus   | Darf                                                                                                                                                        |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`       | Staff oder Kunde | Das Produkt innerhalb der eigenen Organisationen nutzen.                                                                                                    |
| `admin`      | `org.admin`      | Nutzer, Organisationen, Einladungen und Projektvorlagen unter **Admin → Verzeichnis** und **Admin → Vorlagen** verwalten, Audit-Log und Rollenmatrix lesen. |
| `superadmin` | `org.superadmin` | Alles, plus **Admin → Einstellungen** (Branding, Webhooks, API-Keys, MCP, Geräte) und **Admin → System** (Job-Queue, Zeitpläne, Rollen).                    |

## Die Berechtigungsmatrix

Jede Aktion ist einer von 28 Berechtigungen zugeordnet, gruppiert als `admin.*`, `org.*` und `project.*`. Ein Ausschnitt der Standardmatrix:

| Berechtigung               | Org-Superadmin | Org-Admin | Staff | Agent | Client | Member |
| -------------------------- | -------------- | --------- | ----- | ----- | ------ | ------ |
| `project.tasks.create`     | ✓              | ✓         | ✓     | —     | —      | —      |
| `project.tasks.edit.any`   | ✓              | ✓         | —     | —     | —      | —      |
| `project.tasks.delete.any` | ✓              | ✓         | —     | —     | —      | —      |
| `org.tickets.create`       | ✓              | ✓         | —     | ✓     | ✓      | ✓      |
| `org.tickets.read.any`     | ✓              | ✓         | ✓     | ✓     | ✓      | —      |
| `org.tickets.edit.any`     | ✓              | ✓         | —     | ✓     | —      | —      |
| `project.edit`             | ✓              | ✓         | —     | —     | —      | —      |
| `org.members.manage`       | ✓              | ✓         | —     | —     | —      | —      |
| `admin.orgs.manage`        | ✓              | ✓         | —     | —     | —      | —      |
| `admin.settings.manage`    | ✓              | —         | —     | —     | —      | —      |
| `admin.system.manage`      | ✓              | —         | —     | —     | —      | —      |

Staff bearbeiten ihre eigenen Aufgaben und kommentieren jedes Ticket; Tickets öffnen sie selbst nicht. Nur `admin.roles.manage`, `admin.settings.manage` und `admin.system.manage` sind Superadmins vorbehalten. Wiki und Notizen hängen an keiner Berechtigung: Sie stehen jedem Mitglied der internen Organisation offen. Admins sehen die vollständige Matrix, nur lesend, unter **Admin → System → Rollen**.

> [!NOTE]
> **Überall dieselben Regeln**
>
> Web-App, API, CLI, MCP-Server und iOS-App laufen durch dieselbe Berechtigungsprüfung. Fehlt ein Button in der Oberfläche, antwortet der zugehörige Endpunkt mit `403`.

## Projektmitgliedschaft

Jedes Mitglied der internen Organisation sieht jedes Projekt. Ein Projekt hat zusätzlich einen Lead und Mitglieder mit Projektrolle (`project.manager`, `project.member`, `project.viewer`); darüber bekommen **externe** Nutzer Zugriff: Ein Kundenmitglied, das zu einem Projekt hinzugefügt wird, sieht dieses Projekt und außerhalb seines Portals sonst nichts.

## Capabilities

Für jede angemeldete Person liefert die API ein **Capability-Manifest**: welche Bereiche aktiv sind (Tickets, Chat, Aufgaben, Projekte, Wiki, Notizen, Admin, Einstellungen), was schnell angelegt werden kann (Ticket, Aufgabe, Notiz) und die Berechtigungskarte pro Organisation und Projekt. Web-App, CLI, MCP-Server und iOS-App zeigen damit nur, was die Person tun darf.

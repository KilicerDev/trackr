---
title: Organisationen
description: Eine Organisation ist die Grenze für Mitgliedschaft, Tickets und Datentrennung. Ein Konto kann zu vielen gehören.
order: 2
updated: 2026-09-10
---

## Interne und Kundenorganisationen

Genau eine Organisation ist als **intern** markiert: dein eigenes Team. Sie wird beim Einrichten der Instanz angelegt, und das Root-Konto ist Mitglied. Ihre Mitglieder sehen alles. Jede andere Organisation ist ein **Kunde**, dessen Mitglieder das Portal sehen: ihre Tickets und den Chat der Organisation.

- Internes Team sieht alle Organisationen zugleich; der Umschalter in der Seitenleiste wechselt zwischen getrennten Trackr-**Instanzen**, nicht zwischen Organisationen. Wer Mitglied mehrerer Kundenorganisationen ist, wechselt in der Portal-Seitenleiste.
- Mitglieder, Projekte und Tickets fließen nie zwischen Organisationen.
- Ein Kundenmitglied, das zu einem deiner Projekte hinzugefügt wird, verlässt das Portal und bekommt die normale App, beschränkt auf dieses Projekt.
- Kunden lassen sich **archivieren**. Die Organisation verschwindet aus Listen und Auswahlfeldern, die Daten bleiben.

## Mitglieder verwalten

Unter **Admin → Verzeichnis → Organisationen → (Organisation)** fügst du bestehende Nutzer hinzu, änderst ihre Organisationsrolle oder entfernst sie. Unter **Admin → Verzeichnis → Nutzer** lädst du neue Personen per E-Mail ein, legst Nutzer direkt an, sendest Einladungen erneut oder widerrufst sie, löst Passwort-Resets aus, stellst API-Keys aus und kannst als Superadmin einen Nutzer **impersonieren**, um genau das zu sehen, was er sieht.

Jede dieser Aktionen landet im **Audit-Log**, mit Filtern und CSV-Export unter **Admin → System → Logs**.

## Keys, Slugs und IDs

Jede Organisation trägt drei Kennungen:

| Kennung  | Beispiel | Verwendet in                                                                 |
| -------- | -------- | ---------------------------------------------------------------------------- |
| **Key**  | `ACME`   | Ticket-Referenzen (`ACME-7`) und im MCP-Server. Großbuchstaben, 2–6 Zeichen. |
| **Slug** | `acme`   | Im CLI (`trackr ticket create --org acme`).                                  |
| **ID**   | `7a4d…`  | In der API (`orgId` unter `/api/v1`).                                        |

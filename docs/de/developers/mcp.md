---
title: MCP-Server
description: Verbinde claude.ai, Claude Code oder einen beliebigen Model-Context-Protocol-Client mit Trackr. Der Assistent handelt als der angemeldete Nutzer, mit dessen Rechten, und zeigt Ergebnisse als die Zeilen der App.
order: 5
updated: 2026-09-10
badge: new
---

## Was es ist

Jede Trackr-Instanz stellt unter `/api/mcp` einen [Model-Context-Protocol](https://modelcontextprotocol.io)-Server bereit. Ein verbundener Assistent kann Tickets, Aufgaben, Projekte, Wiki-Seiten und Notizen lesen, anlegen und ändern, Checklistenpunkte abhaken, Zeit erfassen, Dateien anhängen und suchen, alles über dieselbe Berechtigungsprüfung wie die Web-App und `/api/v1`.

Drei Regeln prägen alles, was der Server tut:

- **Er handelt als ein Nutzer.** Der Assistent hat genau dessen Rollen und Berechtigungen, nicht mehr. Ein Client kann nie etwas lesen, das sein Nutzer in der App nicht öffnen könnte.
- **Schreibvorgänge sind echt.** Eine aus dem Assistenten angelegte Aufgabe benachrichtigt, feuert Webhooks und landet im Audit-Log, genau als hätte der Nutzer sie in der App angelegt.
- **Zugriff ist standardmäßig aus.** Ein Admin schaltet MCP pro Nutzer im Verzeichnis frei. Bis dahin schlägt das Verbinden mit einer klaren Meldung fehl.

## Zugriff freischalten

1. **Admin → Verzeichnis → Nutzer**: MCP-Zugriff für den Nutzer einschalten. Wird er später wieder ausgeschaltet, verlieren alle Assistenten dieses Nutzers sofort ihre Tokens.
2. Der Nutzer öffnet **Konto → Verbundene Apps**. Dort stehen die Server-URL, der Claude-Code-Befehl, die eigenen Verbindungen sowie persönliche Anweisungen und Guides.
3. **Admin → Einstellungen → MCP** enthält die Workspace-weiten Teile: Assistenten-Anweisungen, Guides und die Liste aller OAuth-Verbindungen mit Widerrufen-Knopf.

## Client verbinden

| Client                  | So geht es                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claude.ai**           | Custom Connector mit der Server-URL anlegen. Claude öffnet die Trackr-Anmeldeseite, der Nutzer bestätigt, und der Assistent handelt ab dann als er.                     |
| **Claude Code**         | `claude mcp add --transport http trackr https://<deine-instanz>/api/mcp` und die Anmeldung im Browser bestätigen.                                                       |
| **Andere MCP-Clients**  | Jeder Client mit Streamable HTTP und OAuth. Die Discovery-Metadaten liegen unter `/.well-known/oauth-authorization-server` und `/.well-known/oauth-protected-resource`. |
| **Skripte und Agenten** | OAuth überspringen und einen persönlichen API-Key als statischen Bearer-Header senden: `Authorization: Bearer trk_…`. Der Nutzer des Keys braucht trotzdem MCP-Zugriff. |

```bash title="terminal"
claude mcp add --transport http trackr https://app.trackr.dev/api/mcp
```

OAuth-Tokens werden pro Autorisierung ausgestellt (Access-Tokens gelten eine Stunde, Refresh-Tokens 30 Tage) und können vom Nutzer unter Verbundene Apps oder von einem Admin unter Einstellungen → MCP widerrufen werden. API-Keys stellt ein Admin aus, oder Nutzer, die eigene unter Verbundene Apps anlegen dürfen; sie werden einmal angezeigt, und ein Widerruf beendet API- und MCP-Zugriff zugleich.

## Tools

Siebenunddreißig Tools, benannt nach dem, was sie tun. Kennungen folgen der App: Tickets als `ORGKEY-n`, Aufgaben als `PROJEKTKEY-n`, Projekte und Organisationen per Key, Wiki-Seiten und Notizen per ID. Alle Inhalte sind Markdown, rein wie raus.

| Bereich   | Tools                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allgemein | `whoami`, `list_orgs`, `list_users`, `search`, `get_inbox`, `get_attachment`, `attach_file`, `get_guide`, `show_items`, `show_task`, `show_ticket` |
| Tickets   | `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `delete_ticket`                                                                    |
| Aufgaben  | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `log_time`, `checklist_toggle`                                              |
| Projekte  | `list_projects`, `get_project`, `create_project`, `update_project`                                                                                 |
| Wiki      | `wiki_tree`, `wiki_get_page`, `wiki_create_folder`, `wiki_create_page`, `wiki_update_page`, `wiki_delete_page`                                     |
| Notizen   | `list_notes`, `get_note`, `create_note`, `create_meeting_note`, `update_note`, `delete_note`                                                       |

Listen sind kompakt und begrenzt (`limit`, höchstens 200) und melden ein `total`. Checklisten bei `update_*` ersetzen das ganze Array; für einen einzelnen Punkt gibt es `checklist_toggle`.

> [!NOTE]
> **Nicht über MCP verfügbar**
>
> Ticket-Antworten und Aufgaben-Kommentare, Chat und Freigabelinks bleiben bewusst der App vorbehalten. Der Assistent verweist den Nutzer dafür dorthin.

## Das Inline-Widget

`list_*`, `search` und `get_*` liefern Text, damit der Assistent so viel lesen kann, wie er braucht, während er etwas herausfindet. Hat er eine Antwort, ruft er einmal `show_items` mit den Aufgaben-, Ticket- oder Projekt-Keys auf, die der Nutzer sehen soll (bis zu 100). Hosts, die MCP Apps unterstützen, darunter claude.ai und Claude Desktop, rendern das Ergebnis als Inline-Widget: dieselben gruppierten Zeilen wie die Listenansichten der App, mit Status, Typ, Priorität, Checklisten-Fortschritt, Fälligkeit und Verantwortlichen. Ein Klick auf eine Zeile öffnet das Element in Trackr. Hosts ohne die Erweiterung bekommen stattdessen den reinen Text.

Für eine einzelne Aufgabe oder ein Ticket ruft der Assistent am Ende einmal `show_task` oder `show_ticket` auf, um statt der Liste die Detailansicht zu zeigen. Diese Tools verwenden dieselben Berechtigungsprüfungen und Detaildaten wie `get_task` und `get_ticket`. Lese- und Aktionstools (`get_*`, `create_*`, `update_*`, `checklist_toggle`, `log_time` usw.) liefern Text und strukturierte Daten, ohne einen Frame zu öffnen. Nur `show_items`, `show_task` und `show_ticket` zeigen ein Widget. Die Bedienelemente einer Aufgabe aktualisieren die bestehende Detailansicht ohne zusätzlichen Frame.

## Ressourcen und Prompts

Die Lese-Tools sind als Ressourcen gespiegelt, damit ein Client ein Element ohne Tool-Aufruf in den Kontext ziehen kann:

```text
trackr://ticket/{key}       text/markdown
trackr://task/{key}         text/markdown
trackr://wiki/{id}          text/markdown
trackr://note/{id}          text/markdown
trackr://attachment/{id}    die Originaldatei
trackr://guide/{slug}       text/markdown
```

Drei Prompts sind eingebaut: **Ticket triagieren** (nimmt einen Ticket-Key), **Daily Standup** (optional ein Projekt-Key) und **Meeting-Notiz schreiben** (Projekt-Key). Jeder stellt die passenden Lesezugriffe für den Assistenten zusammen.

## Anweisungen und Guides

Der Server schickt beim Verbinden einen festen Satz Anweisungen mit. Sie halten den Assistenten dazu an, festzuhalten, was der Nutzer gesagt hat, und es nicht auszuschmücken: keine erfundenen Beschreibungen, Checklistenschritte, Tags oder Fälligkeiten, und Änderungen nur an den Feldern, die der Nutzer nennt.

Darüber liegen drei Ebenen, die du steuerst:

- **Workspace-Anweisungen** (Admin → Einstellungen → MCP): Hausregeln, die jedem Nutzer angehängt werden, etwa in welches Projekt die Aufgaben eines Kunden gehören oder in welcher Sprache geschrieben wird. Kurz halten; sie kosten in jedem Gespräch Kontext.
- **Persönliche Anweisungen** (Konto → Verbundene Apps): dasselbe pro Nutzer, angehängt nach den Workspace-Anweisungen.
- **Guides**: längere Markdown-Dokumente, die der Assistent bei Bedarf mit `get_guide` liest, bevor er Arbeit zu einem Thema plant, das sie abdecken. Eintippen, eine `.md`-Datei hochladen oder eine öffentliche Webseite importieren. Admins veröffentlichen Workspace-Guides; jeder MCP-Nutzer kann bis zu 20 persönliche ergänzen, die nur seine Assistenten sehen, und ein persönlicher Guide mit demselben Slug wie ein Workspace-Guide ersetzt diesen für den Nutzer.

Anweisungen gelten für neue Gespräche; Clients lesen sie beim Verbinden.

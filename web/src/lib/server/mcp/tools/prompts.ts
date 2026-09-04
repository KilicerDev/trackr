// MCP prompts — short, reusable workflows that reference the tools by name.
// Prompt arguments are strings by protocol; keys are normalised by the tools.

import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { McpContext } from './shared';

function userMessage(text: string) {
	return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

export function registerPrompts(server: McpServer, ctx: McpContext): void {
	server.registerPrompt(
		'triage_ticket',
		{
			title: 'Triage a ticket',
			description:
				'Read a ticket, summarise it, propose priority/category/assignee and a reply draft, then apply the triage with update_ticket once confirmed.',
			argsSchema: z.object({
				key: z.string().describe('Ticket display id, e.g. TRACK-108.')
			})
		},
		async ({ key }) =>
			userMessage(
				[
					`Triage trackr ticket ${key.toUpperCase()}.`,
					'',
					`1. Call \`get_ticket\` with key "${key.toUpperCase()}" and read the whole timeline (internal notes included if present).`,
					'2. Summarise the customer’s problem in 2–3 sentences and list what is still unclear.',
					'3. Propose: status, priority (low|medium|high|urgent), category (billing|technical_issue|feature_request|general), tags, and an assignee — use `list_users` with the ticket’s org key to pick a real person, and `search` for related tickets or tasks.',
					'4. Draft a short reply to the customer (markdown) — but do NOT post it; message posting is not available through MCP, so present it for copy-paste.',
					'5. Ask me to confirm, then apply the field changes with `update_ticket` (pass only the changed fields).'
				].join('\n')
			)
	);

	server.registerPrompt(
		'standup',
		{
			title: 'Daily standup',
			description:
				'Build my standup notes from my tasks, tickets and inbox: done yesterday, planned today, blockers. Optionally scoped to one project.',
			argsSchema: z.object({
				projectKey: z.string().optional().describe('Optional project key to focus on.')
			})
		},
		async ({ projectKey }) => {
			const scope = projectKey ? ` for project ${projectKey.toUpperCase()}` : '';
			return userMessage(
				[
					`Prepare my standup update${scope}. I am ${ctx.locals.user.name}.`,
					'',
					`1. Call \`list_tasks\` with scope "mine"${projectKey ? ` and projectKey "${projectKey.toUpperCase()}"` : ''} (limit 100). Group by status; note anything overdue or due today.`,
					'2. Call `list_tickets` with segment "mine" and look for tickets waiting on me (status waiting_on_agent or open with no reply).',
					'3. Call `get_inbox` (unread only) for anything that needs a response.',
					'4. Write three short sections in markdown: **Yesterday** (tasks recently moved to done/in_review), **Today** (in_progress + due soon), **Blockers** (paused tasks, waiting tickets, unanswered notifications). Reference tasks and tickets by key.',
					'5. If I ask, save it as a meeting note with `create_meeting_note` (title "Standup <date>")' +
						(projectKey ? ` in project ${projectKey.toUpperCase()}.` : ' in the project I name.')
				].join('\n')
			);
		}
	);

	server.registerPrompt(
		'write_meeting_note',
		{
			title: 'Write a meeting note',
			description:
				'Turn a transcript or bullet points into a structured meeting note for a project and save it with create_meeting_note.',
			argsSchema: z.object({
				projectKey: z.string().describe('Project key the meeting belongs to.')
			})
		},
		async ({ projectKey }) =>
			userMessage(
				[
					`Write a meeting note for project ${projectKey.toUpperCase()} from the notes or transcript I paste next.`,
					'',
					`1. Call \`get_project\` with key "${projectKey.toUpperCase()}" for context, and \`list_tasks\` with that projectKey (scope "all") so you can reference existing tasks by key.`,
					'2. Structure the note in markdown: **Attendees**, **Agenda**, **Decisions**, **Action items** as a task list (`- [ ] owner: action (due)`), **Open questions**.',
					'3. Where an action item is clearly a new piece of work, offer to create it with `create_task` (ask before creating; use `list_users` with the projectKey to resolve owners).',
					`4. Save the note with \`create_meeting_note\` (projectKey "${projectKey.toUpperCase()}", today’s date unless I say otherwise) and report the note id.`
				].join('\n')
			)
	);
}

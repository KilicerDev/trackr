// Guides (workspace: Settings → MCP; personal: /me/connections): longer markdown documents
// the assistant reads before planning work it does not know first-hand —
// e.g. the steps of a server install. Exposed as the `get_guide` tool (the
// reliable path: some clients only let the *user* attach resources) and as
// trackr://guide/{slug}. The index of enabled guides is repeated in the tool
// description so the model sees what exists even when the client drops the
// server instructions.

import * as z from 'zod/v4';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { getEnabledGuideBySlug, type GuideIndexEntry } from '../guidance';
import { fail, guarded, READ_ONLY, text, ToolError } from './shared';

export function guideIndexLines(guides: GuideIndexEntry[]): string[] {
	return guides.map(
		(g) =>
			`- \`${g.slug}\` — ${g.title}${g.summary ? `: ${g.summary}` : ''}${g.personal ? ' (personal guide of the user you act for)' : ''}`
	);
}

function guideMarkdown(g: {
	title: string;
	slug: string;
	sourceUrl: string | null;
	fetchedAt: Date | null;
	body: string;
}): string {
	const head = [`# ${g.title}`];
	if (g.sourceUrl) {
		head.push(
			`Source: ${g.sourceUrl}${g.fetchedAt ? ` (snapshot from ${g.fetchedAt.toISOString().slice(0, 10)})` : ''}`
		);
	}
	return `${head.join('\n\n')}\n\n${g.body || '_This guide has no content yet._'}`;
}

export function registerGuideTools(
	server: McpServer,
	guides: GuideIndexEntry[],
	userId: string
): void {
	const index = guides.length
		? `Available guides:\n${guideIndexLines(guides).join('\n')}`
		: 'No guides are configured yet (admins add them under Settings → MCP, users under Connected apps).';

	server.registerTool(
		'get_guide',
		{
			title: 'Read a guide',
			description: `Read one of the guides — reference documents the admins wrote for assistants (procedures, hardware/server install tutorials, conventions), or the personal guides of the user you act for. Read the relevant guide BEFORE creating tasks or checklists about a topic it covers, and take the steps from there instead of guessing. Returns markdown.\n\n${index}`,
			inputSchema: z.object({
				slug: z.string().min(1).max(64).describe('Guide slug from the list above.')
			}),
			outputSchema: z.object({
				slug: z.string(),
				title: z.string(),
				summary: z.string(),
				sourceUrl: z.string().nullable(),
				fetchedAt: z.string().nullable(),
				markdown: z.string()
			}),
			annotations: READ_ONLY
		},
		guarded(async ({ slug }) => {
			const guide = await getEnabledGuideBySlug(slug, userId);
			if (!guide) {
				fail(
					404,
					`No guide "${slug}". ${guides.length ? `Known slugs: ${guides.map((g) => g.slug).join(', ')}.` : 'No guides are configured.'}`
				);
			}
			const markdown = guideMarkdown(guide);
			return text(markdown, {
				slug: guide.slug,
				title: guide.title,
				summary: guide.summary,
				sourceUrl: guide.sourceUrl,
				fetchedAt: guide.fetchedAt?.toISOString() ?? null,
				markdown
			});
		})
	);

	server.registerResource(
		'guide',
		new ResourceTemplate('trackr://guide/{slug}', {
			list: async () => ({
				resources: guides.map((g) => ({
					uri: `trackr://guide/${g.slug}`,
					name: g.title,
					description: g.summary || undefined,
					mimeType: 'text/markdown'
				}))
			})
		}),
		{
			title: 'Guide',
			description: 'A guide for assistants — workspace-wide or personal to the user you act for (e.g. trackr://guide/server-install).',
			mimeType: 'text/markdown'
		},
		async (uri, vars) => {
			const raw = Array.isArray(vars.slug) ? vars.slug[0] : vars.slug;
			if (!raw) throw new ToolError(400, 'Missing guide slug in resource URI.');
			const guide = await getEnabledGuideBySlug(decodeURIComponent(raw), userId);
			if (!guide) throw new ToolError(404, `No guide "${raw}".`);
			return {
				contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guideMarkdown(guide) }]
			};
		}
	);
}

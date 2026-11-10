import { describe, expect, test } from 'bun:test';
import { generateHTML, generateJSON } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { collabSchemaExtensions } from './extensions';
import { docHtmlToMarkdown, markdownToDocHtml } from '$lib/server/content/markdown';

const TABLE_MD = '| Name | Owner |\n|---|---|\n| Sidebar | Ertugul |\n| Tables | Claude |';

function nodeTypes(node: JSONContent, out: string[] = []): string[] {
	if (node.type) out.push(node.type);
	for (const child of node.content ?? []) nodeTypes(child, out);
	return out;
}

describe('notes/wiki schema tables', () => {
	test('a markdown table survives parsing into the collab schema', () => {
		const json = generateJSON(markdownToDocHtml(TABLE_MD), collabSchemaExtensions);
		const types = nodeTypes(json);
		expect(types).toContain('table');
		expect(types).toContain('tableHeader');
		expect(types.filter((t) => t === 'tableRow')).toHaveLength(3);
	});

	test('an editor table comes back out as a GFM table', () => {
		const json = generateJSON(markdownToDocHtml(TABLE_MD), collabSchemaExtensions);
		const md = docHtmlToMarkdown(generateHTML(json, collabSchemaExtensions));
		expect(md).toContain('| Name | Owner |');
		expect(md).toMatch(/\| -+ \| -+ \|/);
		expect(md).toContain('| Sidebar | Ertugul |');
		expect(md).toContain('| Tables | Claude |');
	});
});

describe('PDF export of tables', () => {
	test('rows become a pdfmake table, padded under merged cells', async () => {
		const { buildDocDefinition } = await import('$lib/utils/pdf-export');
		const json = generateJSON(markdownToDocHtml(TABLE_MD), collabSchemaExtensions);
		// Merge the last row's two cells into one spanning both columns.
		const rows = json.content![0].content!;
		const last = rows[2];
		last.content = [{ ...last.content![0], attrs: { colspan: 2, rowspan: 1 } }];
		const def = buildDocDefinition('t', json as Parameters<typeof buildDocDefinition>[1]);
		const content = def.content as { table?: { body: unknown[][]; widths: unknown[] } }[];
		const table = content.find((c) => c.table)!.table!;
		expect(table.widths).toHaveLength(2);
		expect(table.body).toHaveLength(3);
		expect(table.body.every((r) => r.length === 2)).toBe(true);
		expect(table.body[2][0]).toMatchObject({ colSpan: 2 });
	});
});

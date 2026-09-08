// Bundle tests against the production build (build/) — `bun run test:build`.
//
// adapter-node bundles the SvelteKit server output and externalizes only the
// packages declared in package.json `dependencies`; everything else is inlined.
// A package that is inlined into one chunk AND loaded from node_modules by an
// external dependency exists twice at runtime, and ProseMirror/Yjs identity
// checks (`instanceof`, "multiple versions of prosemirror-model") then throw.
// That is invisible in dev, where Vite serves a single un-bundled copy, so the
// only place to catch it is the built output (TRACK-133: MCP `update_note`
// with a body 500'd in prod because @tiptap/pm and y-prosemirror were not
// declared as dependencies).

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dir, '../..');
const CHUNKS = join(WEB, 'build/server/chunks');
const SERVER_ENTRY = join(WEB, 'build/server-entry.js');

/**
 * Packages the collab pipeline shares between the SvelteKit bundle (MCP tools,
 * page actions) and the standalone server entry (Hocuspocus). Each must resolve
 * to the single node_modules copy, so no chunk may carry inlined source. The
 * marker is a string unique to the package's own source.
 */
const SINGLETONS: { pkg: string; marker: string }[] = [
	{ pkg: 'prosemirror-model', marker: 'multiple versions of prosemirror-model' },
	{ pkg: 'y-prosemirror', marker: 'node name mismatch!' },
	{ pkg: 'yjs', marker: 'Yjs was already imported' }
];

if (!existsSync(CHUNKS)) {
	throw new Error(`no production build at ${CHUNKS} — run \`bun run build\` first`);
}

const chunkFiles = (await readdir(CHUNKS)).filter((f) => f.endsWith('.js'));
const chunks = new Map<string, string>();
for (const f of chunkFiles) chunks.set(f, await readFile(join(CHUNKS, f), 'utf8'));
if (existsSync(SERVER_ENTRY)) chunks.set('../server-entry.js', await readFile(SERVER_ENTRY, 'utf8'));

describe('server bundle keeps collab packages as single instances', () => {
	for (const { pkg, marker } of SINGLETONS) {
		test(`${pkg} is not inlined into any server chunk`, () => {
			const inlined = [...chunks].filter(([, src]) => src.includes(marker)).map(([f]) => f);
			expect(
				inlined,
				`${pkg} is bundled into ${inlined.join(', ')} — declare it (or the package importing it) in package.json "dependencies" so adapter-node externalizes it`
			).toEqual([]);
		});
	}

	test('the collab chunk imports its ProseMirror/Yjs packages from node_modules', () => {
		const [file, src] = collabChunk();
		for (const spec of ['yjs', 'y-prosemirror', '@tiptap/pm/model']) {
			expect(src, `${file} should import ${spec} externally`).toMatch(
				new RegExp(`from ['"]${spec.replace(/[/.]/g, '\\$&')}['"]`)
			);
		}
	});
});

describe('collab HTML → ProseMirror conversion runs in the built bundle', () => {
	// The chunk keeps `htmlToProseMirrorJSON` internal (only used within the
	// same chunk), so a sibling copy re-exports it; siblings resolve the same
	// relative chunk imports. Cleaned up after the suite.
	const probe = join(CHUNKS, `_probe-${process.pid}.js`);
	afterAll(() => rm(probe, { force: true }));

	test('parses a task list without a duplicate-prosemirror error', async () => {
		const [file, src] = collabChunk();
		expect(src).toContain('function htmlToProseMirrorJSON(');
		await writeFile(probe, `${src}\nexport { htmlToProseMirrorJSON as __probe };\n`);

		// The chunk pulls in the db module, which reads SvelteKit's private env
		// at load; set it the way adapter-node does before importing.
		const sharedFile = chunkFiles.find((f) => f.startsWith('shared-server-'));
		expect(sharedFile, 'shared-server chunk with the env setters').toBeDefined();
		const shared = await import(join(CHUNKS, sharedFile!));
		const setter = /set_private_env as (\w+)/.exec(chunks.get(sharedFile!)!)?.[1];
		expect(setter, `set_private_env export in ${sharedFile}`).toBeDefined();
		shared[setter!]({ DATABASE_URL: 'postgres://probe:probe@127.0.0.1:1/probe' });

		const mod = await import(probe);
		const json = mod.__probe(
			'<h2>Todo</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>'
		);
		expect(json, `conversion in ${file}`).toEqual({
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Todo' }] },
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: true },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }]
						}
					]
				}
			]
		});
	});
});

function collabChunk(): [string, string] {
	const hit = [...chunks].find(
		([f, src]) => !f.startsWith('..') && src.includes('function htmlToProseMirrorJSON(')
	);
	if (!hit) throw new Error('no server chunk defines htmlToProseMirrorJSON');
	return hit;
}

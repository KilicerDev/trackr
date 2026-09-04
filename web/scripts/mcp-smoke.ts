// Smoke test for the MCP endpoint against a running dev server.
//
//   TRACKR_API_KEY=trk_... bun scripts/mcp-smoke.ts [--url http://127.0.0.1:5173/api/mcp] [--query text]
//
// Connects with the Streamable HTTP client transport and a static bearer
// header (a `trk_` personal API key of a user with MCP access enabled), lists
// the tools, then calls `whoami`, `list_projects` and `search`, printing the
// markdown each returns. Start the dev server yourself (`bun run dev`) —
// this script never spawns one.

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg('url', process.env.TRACKR_MCP_URL ?? 'http://127.0.0.1:5173/api/mcp');
// Untyped search needs 2+ characters; "in" hits most titles in a seeded workspace.
const query = arg('query', 'in');
const apiKey = process.env.TRACKR_API_KEY;
if (!apiKey) {
	console.error('TRACKR_API_KEY is required (a trk_ personal API key with MCP access enabled).');
	process.exit(2);
}

function firstText(result: { content: { type: string; text?: string }[] }): string {
	return result.content
		.filter((c) => c.type === 'text')
		.map((c) => c.text ?? '')
		.join('\n');
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
	console.log(`\n=== ${name} ${JSON.stringify(args)}`);
	const result = await client.callTool({ name, arguments: args });
	if (result.isError) console.log('ERROR:', firstText(result));
	else console.log(firstText(result));
	return result;
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
	requestInit: { headers: { Authorization: `Bearer ${apiKey}` } }
});
const client = new Client({ name: 'trackr-mcp-smoke', version: '0.0.1' });

try {
	await client.connect(transport);
	console.log(`connected to ${url}`);
	const server = client.getServerVersion?.();
	if (server) console.log(`server: ${server.name} ${server.version}`);

	const { tools } = await client.listTools();
	console.log(`\n=== tools (${tools.length})`);
	for (const t of tools) {
		const a = t.annotations ?? {};
		const flags = [a.readOnlyHint ? 'read' : 'write', a.destructiveHint ? 'destructive' : null]
			.filter(Boolean)
			.join(',');
		console.log(`- ${t.name} [${flags}] — ${t.description?.split('\n')[0].slice(0, 120) ?? ''}`);
	}

	await call(client, 'whoami');
	await call(client, 'list_projects', { limit: 20 });
	await call(client, 'search', { query });
} catch (err) {
	console.error('smoke test failed:', err instanceof Error ? err.message : err);
	process.exitCode = 1;
} finally {
	await client.close().catch(() => {});
}

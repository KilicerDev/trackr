// Production server entry (bundled to build/server-entry.js by
// scripts/build-server.ts). Wraps adapter-node's request handler and mounts the
// in-process Hocuspocus collab server on the same HTTP server, so HTTP and
// websocket (`/collab`) share one process and one port.

import http from 'node:http';
import { attachCollab } from '$lib/server/collab/handler';
import { getHocuspocus } from '$lib/server/collab/hocuspocus';

// Loaded at runtime (sibling build/handler.js); kept out of the bundle so the
// adapter output stays the source of truth for the SvelteKit handler.
const { handler } = await import(new URL('./handler.js', import.meta.url).href);

const server = http.createServer(handler);
attachCollab(server);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
	console.log(`trackr listening on http://${host}:${port} (collab at /collab)`);
});

let closing = false;
function shutdown() {
	if (closing) return;
	closing = true;
	// Flush any debounced document writes so a deploy doesn't drop recent edits.
	try {
		getHocuspocus().flushPendingStores();
	} catch (e) {
		console.error('collab flush on shutdown failed', e);
	}
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

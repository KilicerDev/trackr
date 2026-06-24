// Mounts the in-process Hocuspocus server onto an existing Node HTTP server's
// `upgrade` event (used by both the dev Vite plugin and the prod server entry),
// so collaboration shares the app's port with no second service.

import { WebSocketServer } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { getHocuspocus } from './hocuspocus';

const COLLAB_PATH = '/collab';

declare global {
	var __collabAttached: boolean | undefined;
}

function toWebRequest(req: IncomingMessage): Request {
	const headers = new Headers();
	for (const [k, v] of Object.entries(req.headers)) {
		if (v === undefined) continue;
		headers.set(k, Array.isArray(v) ? v.join(', ') : v);
	}
	// Scheme is irrelevant — Hocuspocus only reads the URL for query params.
	return new Request(`http://localhost${req.url ?? '/'}`, { headers });
}

export function attachCollab(httpServer: HttpServer): void {
	// Guard against double-binding across HMR reloads / repeated calls.
	if (globalThis.__collabAttached) return;
	globalThis.__collabAttached = true;

	const hocuspocus = getHocuspocus();
	const wss = new WebSocketServer({ noServer: true });

	httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		const { pathname } = new URL(req.url ?? '/', 'http://localhost');
		// Leave every other upgrade (e.g. Vite HMR) untouched.
		if (pathname !== COLLAB_PATH) return;
		wss.handleUpgrade(req, socket, head, (ws) => {
			// handleConnection returns a ClientConnection but does NOT attach its own
			// listeners — incoming frames must be forwarded to it manually (this is
			// what Hocuspocus's built-in crossws transport does under the hood).
			const conn = hocuspocus.handleConnection(ws, toWebRequest(req));
			ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
				const buf = Array.isArray(data) ? Buffer.concat(data) : data;
				const u8 =
					buf instanceof ArrayBuffer
						? new Uint8Array(buf)
						: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
				conn.handleMessage(u8);
			});
			ws.on('close', (code: number, reason: Buffer) => {
				conn.handleClose({ code, reason: reason?.toString() });
			});
		});
	});
}

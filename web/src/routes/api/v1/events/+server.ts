// Server-sent events: the native app's live-update channel. Replaces badge
// polling — the client holds this stream open while foregrounded and refetches
// whatever an event names. Events are invalidation hints only (see
// $lib/server/events), so this stream never carries entity data.
import { requireUser } from '$lib/server/api/guard';
import { subscribeEvents, type AppEvent } from '$lib/server/events';
import type { RequestHandler } from './$types';

// Comment-frame keep-alive. Well under common proxy idle timeouts (nginx
// defaults to 60s) so intermediaries don't sever quiet streams.
const PING_INTERVAL_MS = 25_000;

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);

	let unsubscribe: (() => void) | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;
	const cleanup = () => {
		unsubscribe?.();
		if (ping) clearInterval(ping);
	};

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const write = (chunk: string) => {
				// enqueue throws once the client is gone; treat it as a disconnect.
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			// Reconnect delay for the client's EventSource-equivalent.
			write('retry: 3000\n\n');
			unsubscribe = subscribeEvents(user.id, (event: AppEvent) => {
				write(`data: ${JSON.stringify(event)}\n\n`);
			});
			ping = setInterval(() => write(': ping\n\n'), PING_INTERVAL_MS);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			connection: 'keep-alive',
			// Tell nginx-style proxies not to buffer the stream.
			'x-accel-buffering': 'no'
		}
	});
};

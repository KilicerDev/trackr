#!/usr/bin/env bun
/**
 * TCP proxy that adds artificial latency in front of Postgres, to see how a
 * page's server time scales with the round-trip time between the app and the
 * database (which is what a real deployment pays and a laptop hides).
 *
 *   LAG=5 bun run scripts/perf/lagproxy.ts          # 127.0.0.1:5433 -> 127.0.0.1:5432
 *   DATABASE_URL=postgres://dev:dev@127.0.0.1:5433/trackr bun build/server-entry.js
 *
 * Every chunk the client sends is held for LAG milliseconds before it is
 * forwarded; server replies pass through untouched. A query is normally one
 * chunk, so LAG is roughly the added cost per sequential query.
 *
 *   LAG        added delay in ms (default 5)
 *   LISTEN     local port (default 5433)
 *   UPSTREAM   host:port of the real database (default 127.0.0.1:5432)
 */

const LAG = Number(process.env.LAG ?? 5);
const LISTEN = Number(process.env.LISTEN ?? 5433);
const [UP_HOST, UP_PORT] = (process.env.UPSTREAM ?? '127.0.0.1:5432').split(':');

type Upstream = { write(data: Uint8Array): number; end(): void };
type State = { up: Upstream | null; queue: Uint8Array[] };

Bun.listen<State>({
	hostname: '127.0.0.1',
	port: LISTEN,
	socket: {
		open(client) {
			client.data = { up: null, queue: [] };
			Bun.connect({
				hostname: UP_HOST,
				port: Number(UP_PORT),
				socket: {
					data(_socket, chunk) {
						client.write(chunk);
					},
					close() {
						client.end();
					},
					error() {
						client.end();
					}
				}
			}).then(
				(up) => {
					client.data.up = up;
					// Flush anything the client sent while we were still connecting.
					for (const chunk of client.data.queue) setTimeout(() => up.write(chunk), LAG);
					client.data.queue = [];
				},
				() => client.end()
			);
		},
		data(client, chunk) {
			const copy = new Uint8Array(chunk);
			const up = client.data.up;
			if (!up) {
				client.data.queue.push(copy);
				return;
			}
			setTimeout(() => up.write(copy), LAG);
		},
		close(client) {
			client.data.up?.end();
		},
		error(client) {
			client.data.up?.end();
		}
	}
});

console.log(`lag proxy: 127.0.0.1:${LISTEN} -> ${UP_HOST}:${UP_PORT}, +${LAG}ms per client chunk`);

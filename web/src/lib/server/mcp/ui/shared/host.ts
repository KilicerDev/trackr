// Host bridge shared by the widgets: one `App` instance, theme sync, size
// reporting, tool results in, tool calls + link opens out. Nothing here talks
// to trackr directly — every call goes through the host, as the same user.

import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { PRIORITY, type StatusMeta } from './taxonomy';

export type ToolResultLike = {
	structuredContent?: unknown;
	content?: unknown;
	isError?: boolean;
};

let app: App | null = null;

export function connectApp(opts: {
	name: string;
	onResult: (result: ToolResultLike) => void;
	onError: (message: string) => void;
}): App {
	app = new App({ name: opts.name, version: '1.0.0' });
	app.ontoolresult = (result) => {
		if (result.isError) {
			opts.onError(textOf(result) || 'The tool call failed.');
			return;
		}
		opts.onResult(result as ToolResultLike);
	};
	app.onhostcontextchanged = (ctx) => applyTheme(ctx.theme);
	new ResizeObserver(reportSize).observe(document.documentElement);
	app
		.connect()
		.then(() => applyTheme(app?.getHostContext()?.theme))
		.catch((err: Error) => opts.onError(`Could not connect to the host: ${err.message}`));
	return app;
}

/** Text blocks of a tool result joined (error messages, fallbacks). */
export function textOf(result: ToolResultLike): string {
	return ((result.content as { type: string; text?: string }[]) ?? [])
		.filter((c) => c.type === 'text')
		.map((c) => c.text ?? '')
		.join('\n');
}

/**
 * The structured payload of a result, falling back to a JSON text block for
 * hosts that only forward text. Returns null when there is none.
 */
export function payloadOf<T>(result: ToolResultLike, has: (v: Partial<T>) => boolean): T | null {
	const sc = result.structuredContent as Partial<T> | undefined;
	if (sc && has(sc)) return sc as T;
	for (const block of (result.content as { type: string; text?: string }[]) ?? []) {
		if (block.type !== 'text' || !block.text) continue;
		try {
			const parsed = JSON.parse(block.text) as Partial<T>;
			if (has(parsed)) return parsed as T;
		} catch {
			/* not JSON */
		}
	}
	return null;
}

/** Call a server tool through the host; throws with the tool's message on error. */
export async function callTool<T>(
	name: string,
	args: Record<string, unknown>,
	has: (v: Partial<T>) => boolean
): Promise<T> {
	if (!app) throw new Error('Not connected to the host.');
	const result = (await app.callServerTool({ name, arguments: args })) as ToolResultLike;
	if (result.isError) throw new Error(textOf(result) || `${name} failed.`);
	const payload = payloadOf<T>(result, has);
	if (!payload) throw new Error(`${name} returned no data.`);
	return payload;
}

export async function openLink(url: string): Promise<void> {
	if (!app) throw new Error('Not connected to the host.');
	await app.openLink({ url });
}

export function reportSize() {
	if (!app) return;
	const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
	void app.sendSizeChanged({ height }).catch(() => {});
}

export function applyTheme(theme: string | undefined) {
	if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
	else delete document.documentElement.dataset.theme;
}

// ─── DOM helpers ────────────────────────────────────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | undefined> = {},
	...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined) continue;
		if (k === 'class') node.className = v;
		else if (k.startsWith('--')) node.style.setProperty(k, v);
		else node.setAttribute(k, v);
	}
	for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
	return node;
}

export function badge(meta: StatusMeta): HTMLElement {
	return el(
		'span',
		{ class: 'badge', '--dot': meta.dot, '--tint': meta.tint },
		el('span', { class: 'dot' }),
		meta.label
	);
}

export function priorityBars(p: string): HTMLElement {
	const meta = PRIORITY[p] ?? PRIORITY.none;
	const wrap = el('span', { class: 'prio', title: meta.label, '--color': meta.color });
	for (let i = 1; i <= 4; i++) wrap.append(el('i', { class: i <= meta.bars ? 'on' : undefined }));
	return wrap;
}

export function relative(iso: string | null | undefined): string {
	if (!iso) return '—';
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return iso;
	const m = Math.round((Date.now() - t) / 60_000);
	if (m < 1) return 'now';
	if (m < 60) return `${m}m`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.round(h / 24);
	if (d < 30) return `${d}d`;
	return new Date(iso).toLocaleDateString();
}

export function dateOnly(iso: string | null | undefined): string {
	if (!iso) return '—';
	return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleString();
}

export function minutesToHuman(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

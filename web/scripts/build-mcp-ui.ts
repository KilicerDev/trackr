#!/usr/bin/env bun
/**
 * Builds every MCP App widget (src/lib/server/mcp/ui/<widget>/index.html) into
 * a single self-contained HTML file at src/lib/server/mcp/ui/dist/<widget>/
 * index.html, which src/lib/server/mcp/ui/index.ts inlines with `?raw`.
 *
 *   bun run mcp:ui            (also part of `prepare` and `build`)
 *
 * One Vite build per widget: vite-plugin-singlefile disables code splitting,
 * which Rollup only allows with a single input, so the widgets can't share
 * one build invocation. See vite.mcp-ui.config.ts for the per-widget config.
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { widgetConfig, UI_ROOT } from '../vite.mcp-ui.config';

const widgets = readdirSync(UI_ROOT).filter((name) => {
	if (name === 'dist' || name === 'shared' || name.startsWith('.')) return false;
	const dir = resolve(UI_ROOT, name);
	return (
		statSync(dir).isDirectory() && statSync(resolve(dir, 'index.html'), { throwIfNoEntry: false })
	);
});

if (widgets.length === 0) {
	console.error('No widgets found under', UI_ROOT);
	process.exit(1);
}

rmSync(resolve(UI_ROOT, 'dist'), { recursive: true, force: true });
for (const widget of widgets) {
	const started = Date.now();
	await build(widgetConfig(widget));
	console.log(`✓ mcp-ui ${widget} → dist/${widget}/index.html (${Date.now() - started} ms)`);
}

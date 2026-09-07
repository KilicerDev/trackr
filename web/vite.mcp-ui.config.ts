// Vite config for the MCP App widgets (src/lib/server/mcp/ui/<widget>/).
// Each widget becomes ONE self-contained HTML file the MCP server serves as a
// `ui://trackr/<widget>.html` resource. Separate from the SvelteKit config on
// purpose: these pages run inside the MCP host's sandboxed iframe, not in
// trackr, so they get no SvelteKit runtime, no Tailwind and no paraglide —
// just the ext-apps client and their own CSS.
//
// Driven by scripts/build-mcp-ui.ts (`bun run mcp:ui`), one build per widget:
// vite-plugin-singlefile turns code splitting off, which Rollup only accepts
// with a single input. Output is gitignored and imported with `?raw` by
// src/lib/server/mcp/ui/index.ts.

import { resolve } from 'node:path';
import { defineConfig, type InlineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export const UI_ROOT = resolve(import.meta.dirname, 'src/lib/server/mcp/ui');

/** Build config for one widget directory under UI_ROOT. */
export function widgetConfig(widget: string): InlineConfig {
	return {
		configFile: false,
		root: UI_ROOT,
		plugins: [viteSingleFile()],
		build: {
			// Vite keeps the input's path relative to `root`, so this lands at
			// dist/<widget>/index.html. The build script wipes dist/ up front.
			outDir: resolve(UI_ROOT, 'dist'),
			emptyOutDir: false,
			rollupOptions: {
				input: resolve(UI_ROOT, widget, 'index.html'),
				output: { entryFileNames: '[name].js', assetFileNames: '[name][extname]' }
			},
			// Fine for a single-file iframe app; the ext-apps client is ~330 kB.
			chunkSizeWarningLimit: 1500
		},
		logLevel: 'warn'
	};
}

// `vite build --config vite.mcp-ui.config.ts` (without the script) builds the
// list widget only; the script is the real entry point.
export default defineConfig(widgetConfig('list'));

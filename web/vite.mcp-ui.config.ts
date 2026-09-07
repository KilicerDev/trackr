// Builds the MCP App widgets (src/lib/server/mcp/ui/*) into single-file HTML
// bundles that the MCP server serves as `ui://trackr/*` resources. Separate
// from the SvelteKit config on purpose: these pages run inside the MCP host's
// sandboxed iframe, not in trackr, so they get no SvelteKit runtime, no
// Tailwind and no paraglide — just the ext-apps client and their own CSS.
//
//   bun run mcp:ui        → src/lib/server/mcp/ui/dist/<name>/index.html
//
// Runs as part of `prepare` and `build`; the output is gitignored and imported
// with `?raw` by src/lib/server/mcp/ui/index.ts.

import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = resolve(import.meta.dirname, 'src/lib/server/mcp/ui');

export default defineConfig({
	root,
	plugins: [viteSingleFile()],
	build: {
		outDir: resolve(root, 'dist'),
		emptyOutDir: true,
		// One entry per widget; the output keeps the widget's directory name.
		rollupOptions: {
			input: { tickets: resolve(root, 'tickets/index.html') },
			output: { entryFileNames: '[name].js' }
		},
		// Fine for a single-file iframe app; the ext-apps client is ~330 kB.
		chunkSizeWarningLimit: 1500
	},
	logLevel: 'warn'
});

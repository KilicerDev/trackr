// Bundles the production server entry (src/server.ts) to build/server-entry.js.
//
// adapter-node emits build/handler.js but its own build/index.js can't attach a
// websocket upgrade handler. This produces a sibling entry that does. node_modules
// deps stay external (resolved at runtime); only our own $lib code is bundled, with
// SvelteKit's `$env/dynamic/private` virtual module shimmed to process.env and
// `$lib` resolved to src/lib.

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';

const root = process.cwd();

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

// Resolve a `$lib/...` import to a concrete file (Bun's onResolve return is taken
// verbatim, so extensions/index files must be applied here). Files win over the
// bare directory so `$lib/server/db` → `…/db/index.ts`, not the directory.
function resolveLib(rest: string): string {
	const base = path.join(root, 'src/lib', rest);
	for (const cand of [
		`${base}.ts`,
		`${base}.js`,
		path.join(base, 'index.ts'),
		path.join(base, 'index.js'),
		base
	]) {
		if (isFile(cand)) return cand;
	}
	return base;
}

const skVirtuals: BunPlugin = {
	name: 'sveltekit-virtuals',
	setup(build) {
		build.onResolve({ filter: /^\$env\/(dynamic|static)\/(private|public)$/ }, () => ({
			path: 'sk-env',
			namespace: 'sk-virtual'
		}));
		build.onLoad({ filter: /.*/, namespace: 'sk-virtual' }, () => ({
			contents: 'export const env = process.env; export default env;',
			loader: 'js'
		}));
		build.onResolve({ filter: /^\$lib(\/|$)/ }, (args) => ({
			path: resolveLib(args.path.slice('$lib'.length))
		}));
		// Externalize every bare npm specifier (anything not $lib / $env / relative).
		// Only our own $lib code is bundled; all deps resolve from node_modules at
		// runtime. Curating this from package.json's direct deps alone is a trap:
		// a *transitively*-required package (e.g. @tiptap/pm → prosemirror-model,
		// imported directly by the collab seed) would otherwise get bundled into a
		// SECOND copy, separate from the one the external @tiptap/* and
		// @hocuspocus/transformer load at runtime. That dual-package split makes
		// ProseMirror schema/node identity checks fail, so the HTML<->Yjs conversion
		// throws in prod and template-seeded notes come up empty (works in dev,
		// where Vite serves a single un-bundled copy).
		build.onResolve({ filter: /^[^./$]/ }, (args) =>
			// The entry point (no importer) and any local `src/...` module must still
			// be bundled; only genuine bare package specifiers go external.
			!args.importer || args.path.startsWith('src/')
				? undefined
				: { path: args.path, external: true }
		);
	}
};

const external = [
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.devDependencies ?? {})
];

const result = await Bun.build({
	entrypoints: ['src/server.ts'],
	outdir: 'build',
	naming: 'server-entry.js',
	target: 'bun',
	external,
	plugins: [skVirtuals]
});

if (!result.success) {
	console.error('server-entry build failed');
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
console.log('built build/server-entry.js');

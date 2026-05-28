import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// Mounts the in-process Hocuspocus server onto Vite's dev HTTP server so
// collaboration runs in the same process on the same port (5173) in dev.
// `ssrLoadModule` is used so the handler's `$lib`/`$env` imports resolve.
function collabDev(): Plugin {
	return {
		name: 'collab-dev',
		apply: 'serve',
		configureServer(server) {
			if (!server.httpServer) return;
			server.httpServer.once('listening', async () => {
				const { attachCollab } = await server.ssrLoadModule(
					'/src/lib/server/collab/handler.ts'
				);
				attachCollab(server.httpServer);
			});
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), collabDev()],
	// Yjs and its bindings MUST be single instances in the browser bundle —
	// duplicate copies silently break the CRDT (the editor connects but never
	// syncs and remote cursors never appear). Dedupe + pre-bundle them together.
	resolve: { dedupe: ['yjs', 'y-prosemirror'] },
	optimizeDeps: {
		include: [
			'yjs',
			'y-prosemirror',
			'@hocuspocus/provider',
			'@tiptap/extension-collaboration',
			'@tiptap/extension-collaboration-caret'
		]
	}
});

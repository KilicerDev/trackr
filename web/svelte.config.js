import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		// The built-in origin check runs before hooks and rejects every form
		// POST without an Origin header — which is what the native iOS app
		// (URLSession) and CLI send for multipart uploads. The same check is
		// re-implemented in hooks.server.ts (handleCsrf), minus requests that
		// carry an Authorization header. Keep this false; don't drop the hook.
		csrf: { checkOrigin: false },
		// Load $env/dynamic/* from the repo-root .env (shared with docker compose
		// and the Go services). vite.config.ts sets the matching `envDir`.
		env: { dir: '../' },
		typescript: {
			config: (config) => ({
				...config,
				include: [...config.include, '../drizzle.config.ts']
			})
		}
	}
};

export default config;

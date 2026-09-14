/**
 * Defer a module-scope singleton until its first property access.
 *
 * `vite build` imports every server module (hooks.server.ts, +server.ts,
 * +page.server.ts) inside SvelteKit's analysis worker to read their
 * `prerender`/`config` exports. The Docker build stage runs with no runtime
 * environment (no DATABASE_URL, no BETTER_AUTH_SECRET), so anything that
 * validates its configuration while being constructed at module scope makes
 * the image build fail. Wrapping the singleton keeps the same export shape and
 * type while moving construction to the first real use at runtime — which is
 * still "fail fast": the first request that touches it throws the same error.
 */
export function lazy<T extends object>(create: () => T): T {
	let instance: T | undefined;
	return new Proxy({} as T, {
		get(_target, prop) {
			instance ??= create();
			const value = Reflect.get(instance, prop, instance);
			return typeof value === 'function' ? value.bind(instance) : value;
		},
		has(_target, prop) {
			instance ??= create();
			return Reflect.has(instance, prop);
		}
	});
}

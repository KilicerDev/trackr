export function resolveDatabaseUrl(env: Record<string, string | undefined>): string {
	if (env.DATABASE_URL) return env.DATABASE_URL;

	const user = env.POSTGRES_USER;
	const password = env.POSTGRES_PASSWORD;
	const database = env.POSTGRES_DB;

	if (!user || !password || !database) {
		throw new Error(
			'Database connection is not configured. Set DATABASE_URL, or set POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.'
		);
	}

	const host = env.POSTGRES_HOST || 'localhost';
	const port = env.POSTGRES_PORT || '5432';

	return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

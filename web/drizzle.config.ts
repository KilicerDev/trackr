import './scripts/load-root-env';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/lib/server/db/resolve-url';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: resolveDatabaseUrl(process.env) },
	verbose: true,
	strict: true
});

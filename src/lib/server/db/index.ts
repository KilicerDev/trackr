import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { resolveDatabaseUrl } from './resolve-url';

const client = postgres(resolveDatabaseUrl(env));

export const db = drizzle(client, { schema });

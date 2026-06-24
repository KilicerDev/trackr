/**
 * Storage layer entrypoint.
 *
 * Exposes a single configured `storage` driver, selected from the environment:
 *
 *   STORAGE_DRIVER     "s3" (any S3-compatible endpoint — dev MinIO, AWS, R2,
 *                      Supabase) or "local" (on-disk).
 *   STORAGE_LOCAL_DIR  Root directory for the local driver, resolved relative
 *                      to the process working directory. Default "data/attachments".
 *   S3_*               See ./s3.ts for the S3 driver's settings.
 *
 * Import `storage` anywhere on the server; import the types/errors for typing
 * and error handling.
 */

import { env } from '$env/dynamic/private';
import { LocalStorageDriver } from './local';
import { S3StorageDriver } from './s3';
import type { StorageDriver } from './types';

export type { StorageDriver, StoragePutBody, StorageStat } from './types';
export { StorageError, StorageObjectNotFoundError } from './types';
export { isValidKey, assertValidKey } from './keys';

function createStorage(): StorageDriver {
	const driver = env.STORAGE_DRIVER || 'local';
	switch (driver) {
		case 'local':
			return new LocalStorageDriver(env.STORAGE_LOCAL_DIR || 'data/attachments');
		case 's3': {
			if (!env.S3_BUCKET) {
				throw new Error('STORAGE_DRIVER="s3" requires S3_BUCKET to be set.');
			}
			return new S3StorageDriver({
				bucket: env.S3_BUCKET,
				region: env.S3_REGION || 'us-east-1',
				endpoint: env.S3_ENDPOINT || undefined,
				accessKeyId: env.S3_ACCESS_KEY_ID || '',
				secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
				// Path-style is required by MinIO and most non-AWS endpoints;
				// default it on whenever a custom endpoint is configured.
				forcePathStyle: env.S3_FORCE_PATH_STYLE
					? env.S3_FORCE_PATH_STYLE === 'true'
					: Boolean(env.S3_ENDPOINT)
			});
		}
		default:
			throw new Error(
				`Unknown STORAGE_DRIVER: ${JSON.stringify(driver)}. Supported: "s3", "local".`
			);
	}
}

/** The configured storage driver. A process-wide singleton. */
export const storage: StorageDriver = createStorage();

/**
 * Storage layer entrypoint.
 *
 * Exposes a single configured `storage` driver, selected from the environment:
 *
 *   STORAGE_DRIVER     "local" (default). Future: "s3".
 *   STORAGE_LOCAL_DIR  Root directory for the local driver, resolved relative
 *                      to the process working directory. Default "data/attachments".
 *
 * Import `storage` anywhere on the server; import the types/errors for typing
 * and error handling.
 */

import { env } from '$env/dynamic/private';
import { LocalStorageDriver } from './local';
import type { StorageDriver } from './types';

export type { StorageDriver, StoragePutBody, StorageStat } from './types';
export { StorageError, StorageObjectNotFoundError } from './types';
export { isValidKey, assertValidKey } from './keys';

function createStorage(): StorageDriver {
	const driver = env.STORAGE_DRIVER || 'local';
	switch (driver) {
		case 'local':
			return new LocalStorageDriver(env.STORAGE_LOCAL_DIR || 'data/attachments');
		default:
			throw new Error(`Unknown STORAGE_DRIVER: ${JSON.stringify(driver)}. Supported: "local".`);
	}
}

/** The configured storage driver. A process-wide singleton. */
export const storage: StorageDriver = createStorage();

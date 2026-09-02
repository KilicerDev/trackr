// Storage driver for the seeder. The app's `$lib/server/storage` entrypoint
// reads `$env/dynamic/private`, which only exists inside SvelteKit — so build
// the same driver here from process.env (the root .env is already loaded).

import { LocalStorageDriver } from '../../../src/lib/server/storage/local';
import { S3StorageDriver } from '../../../src/lib/server/storage/s3';
import type { StorageDriver } from '../../../src/lib/server/storage/types';

export function openStorage(): StorageDriver {
	const env = process.env;
	const driver = env.STORAGE_DRIVER || 'local';
	if (driver === 'local') {
		return new LocalStorageDriver(env.STORAGE_LOCAL_DIR || 'data/attachments');
	}
	if (driver === 's3') {
		if (!env.S3_BUCKET) throw new Error('STORAGE_DRIVER="s3" requires S3_BUCKET to be set.');
		return new S3StorageDriver({
			bucket: env.S3_BUCKET,
			region: env.S3_REGION || 'us-east-1',
			endpoint: env.S3_ENDPOINT || undefined,
			accessKeyId: env.S3_ACCESS_KEY_ID || '',
			secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
			forcePathStyle: env.S3_FORCE_PATH_STYLE
				? env.S3_FORCE_PATH_STYLE === 'true'
				: Boolean(env.S3_ENDPOINT)
		});
	}
	throw new Error(`Unknown STORAGE_DRIVER: ${JSON.stringify(driver)}`);
}

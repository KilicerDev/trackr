/**
 * S3-compatible storage driver.
 *
 * Works against AWS S3 and any S3-compatible endpoint — MinIO (the dev
 * default, the shared `dev-minio` container from `bun run s3:start`),
 * Cloudflare R2, Supabase Storage's S3 endpoint, etc. Configuration comes
 * from the factory in ./index.ts:
 *
 *   S3_ENDPOINT          Custom endpoint URL. Leave empty for AWS S3.
 *   S3_REGION            Region. Default "us-east-1" (MinIO ignores it).
 *   S3_BUCKET            Bucket name (required).
 *   S3_ACCESS_KEY_ID     Access key.
 *   S3_SECRET_ACCESS_KEY Secret key.
 *   S3_FORCE_PATH_STYLE  "true"/"false". Path-style URLs are required by
 *                        MinIO and most non-AWS endpoints; defaults to true
 *                        whenever S3_ENDPOINT is set.
 *
 * `put` buffers stream bodies before uploading: PutObject needs a known
 * content length, and every current caller passes Buffers anyway.
 */

import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException
} from '@aws-sdk/client-s3';
import { assertValidKey } from './keys';
import {
	StorageError,
	StorageObjectNotFoundError,
	type StorageDriver,
	type StoragePutBody,
	type StorageStat
} from './types';

export type S3DriverConfig = {
	bucket: string;
	region: string;
	endpoint?: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
};

/** Whether an SDK error means "the object/key does not exist". */
function isNotFound(err: unknown): boolean {
	if (err instanceof S3ServiceException) {
		return (
			err.$metadata?.httpStatusCode === 404 || err.name === 'NoSuchKey' || err.name === 'NotFound'
		);
	}
	return false;
}

async function bufferStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const chunks: Uint8Array[] = [];
	const reader = stream.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

export class S3StorageDriver implements StorageDriver {
	private readonly client: S3Client;
	private readonly bucket: string;

	constructor(config: S3DriverConfig) {
		this.bucket = config.bucket;
		this.client = new S3Client({
			region: config.region,
			...(config.endpoint ? { endpoint: config.endpoint } : {}),
			forcePathStyle: config.forcePathStyle,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey
			}
		});
	}

	async put(key: string, body: StoragePutBody): Promise<void> {
		assertValidKey(key);
		const bytes = body instanceof ReadableStream ? await bufferStream(body) : body;
		await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes }));
	}

	async get(key: string): Promise<Buffer> {
		assertValidKey(key);
		try {
			const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
			if (!res.Body) throw new StorageError(`Empty response body for key: ${key}`);
			return Buffer.from(await res.Body.transformToByteArray());
		} catch (err) {
			if (isNotFound(err)) throw new StorageObjectNotFoundError(key);
			throw err;
		}
	}

	async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
		assertValidKey(key);
		try {
			const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
			if (!res.Body) throw new StorageError(`Empty response body for key: ${key}`);
			return res.Body.transformToWebStream() as ReadableStream<Uint8Array>;
		} catch (err) {
			if (isNotFound(err)) throw new StorageObjectNotFoundError(key);
			throw err;
		}
	}

	async stat(key: string): Promise<StorageStat | null> {
		assertValidKey(key);
		try {
			const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
			return { size: res.ContentLength ?? 0 };
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async exists(key: string): Promise<boolean> {
		return (await this.stat(key)) !== null;
	}

	async delete(key: string): Promise<void> {
		assertValidKey(key);
		// DeleteObject is idempotent: deleting a missing key succeeds.
		await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}
}

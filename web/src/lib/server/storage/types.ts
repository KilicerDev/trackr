/**
 * Storage layer — a driver-based blob store.
 *
 * The storage layer is deliberately dumb: it stores and retrieves opaque byte
 * blobs under caller-chosen keys and knows nothing about attachments, images,
 * MIME types, or thumbnails. Higher-level systems (the attachments service) own
 * all naming and metadata — metadata lives in the database, not here.
 *
 * This keeps the physical backend swappable: a local-disk driver today, an
 * S3-compatible driver later, behind the same `StorageDriver` interface.
 */

/** Byte payloads accepted by {@link StorageDriver.put}. */
export type StoragePutBody = Buffer | Uint8Array | ReadableStream<Uint8Array>;

/** Metadata about a stored object. */
export interface StorageStat {
	/** Size of the object in bytes. */
	size: number;
}

/**
 * A blob store. Implementations persist opaque byte blobs under string keys.
 *
 * Keys are forward-slash separated paths (e.g. `attachments/<id>/original`).
 * They must satisfy `assertValidKey` — drivers reject anything else rather than
 * risk path traversal or backend-specific surprises. Callers own key naming.
 *
 * `put` overwrites silently: writing the same key twice is idempotent.
 */
export interface StorageDriver {
	/** Store `body` under `key`, creating any intermediate structure. Overwrites. */
	put(key: string, body: StoragePutBody): Promise<void>;
	/** Read the whole object into a Buffer. Throws {@link StorageObjectNotFoundError} if absent. */
	get(key: string): Promise<Buffer>;
	/** Open the object as a stream. Throws {@link StorageObjectNotFoundError} if absent. */
	getStream(key: string): Promise<ReadableStream<Uint8Array>>;
	/** Return object metadata, or `null` if the object does not exist. */
	stat(key: string): Promise<StorageStat | null>;
	/** Whether an object exists at `key`. */
	exists(key: string): Promise<boolean>;
	/** Remove the object. A no-op if it does not exist. */
	delete(key: string): Promise<void>;
}

/** Base class for all storage-layer errors. */
export class StorageError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'StorageError';
	}
}

/** Thrown by `get`/`getStream` when the requested key has no object. */
export class StorageObjectNotFoundError extends StorageError {
	constructor(public readonly key: string) {
		super(`No stored object for key: ${JSON.stringify(key)}`);
		this.name = 'StorageObjectNotFoundError';
	}
}

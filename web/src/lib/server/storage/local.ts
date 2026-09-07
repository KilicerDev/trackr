/**
 * Local-disk storage driver.
 *
 * Stores each blob as a file under a root directory, mirroring the key's
 * slash-separated structure. Writes are atomic (write to a temp file, then
 * rename) so a crash mid-write never leaves a partial file at a live key.
 *
 * In production the root directory must be a persistent volume — see
 * docker-compose.yaml. In development it defaults to `data/attachments` in the
 * project (gitignored).
 */

import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { assertValidKey } from './keys';
import {
	StorageError,
	StorageObjectNotFoundError,
	type StorageDriver,
	type StoragePutBody,
	type StorageStat
} from './types';

/** Whether an error is a "no such file or directory" filesystem error. */
function isENOENT(err: unknown): boolean {
	return (
		typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT'
	);
}

export class LocalStorageDriver implements StorageDriver {
	/** Absolute, resolved root directory. All objects live under here. */
	private readonly root: string;

	constructor(rootDir: string) {
		this.root = resolve(rootDir);
	}

	/**
	 * Map a validated key to an absolute path, with a defence-in-depth check
	 * that the resolved path stays within the root. `assertValidKey` already
	 * makes traversal impossible; this catches any future key-rule mistake.
	 */
	private pathFor(key: string): string {
		assertValidKey(key);
		const full = resolve(this.root, ...key.split('/'));
		if (full !== this.root && !full.startsWith(this.root + sep)) {
			throw new StorageError(`Resolved path escapes storage root: ${JSON.stringify(key)}`);
		}
		return full;
	}

	async put(key: string, body: StoragePutBody): Promise<void> {
		const target = this.pathFor(key);
		await mkdir(dirname(target), { recursive: true });

		// Write to a unique temp file in the same directory, then rename onto
		// the target — rename is atomic within a filesystem.
		const tmp = `${target}.${randomBytes(8).toString('hex')}.tmp`;
		try {
			if (body instanceof ReadableStream) {
				// Web vs node:stream/web ReadableStream differ only structurally
				// (and @types/bun widens the web one further, hence via unknown).
				const nodeStream = Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>);
				await pipeline(nodeStream, createWriteStream(tmp));
			} else {
				await writeFile(tmp, body);
			}
			await rename(tmp, target);
		} catch (err) {
			await rm(tmp, { force: true });
			throw err;
		}
	}

	async get(key: string): Promise<Buffer> {
		try {
			return await readFile(this.pathFor(key));
		} catch (err) {
			if (isENOENT(err)) throw new StorageObjectNotFoundError(key);
			throw err;
		}
	}

	async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
		// Confirm existence first so a missing object surfaces as a thrown
		// error, not an `error` event on a stream the caller has yet to read.
		if (!(await this.stat(key))) throw new StorageObjectNotFoundError(key);
		return Readable.toWeb(
			createReadStream(this.pathFor(key))
		) as unknown as ReadableStream<Uint8Array>;
	}

	async stat(key: string): Promise<StorageStat | null> {
		try {
			const s = await stat(this.pathFor(key));
			return { size: s.size };
		} catch (err) {
			if (isENOENT(err)) return null;
			throw err;
		}
	}

	async exists(key: string): Promise<boolean> {
		return (await this.stat(key)) !== null;
	}

	async delete(key: string): Promise<void> {
		const target = this.pathFor(key);
		try {
			await unlink(target);
		} catch (err) {
			if (!isENOENT(err)) throw err;
		}
		await this.pruneEmptyDirs(dirname(target));
	}

	/**
	 * Best-effort removal of now-empty parent directories, walking up until a
	 * non-empty directory (or the root) stops it. Keeps the tree from
	 * accumulating empty `attachments/<id>/` shells after deletions.
	 */
	private async pruneEmptyDirs(startDir: string): Promise<void> {
		let current = startDir;
		while (current.startsWith(this.root + sep)) {
			try {
				await rmdir(current);
			} catch {
				// Directory is non-empty or already gone — stop walking up.
				return;
			}
			current = dirname(current);
		}
	}
}

/**
 * Storage key validation.
 *
 * A storage key is a forward-slash separated path of segments. Validation is
 * strict and allow-list based: every segment must match {@link KEY_SEGMENT}.
 * This rejects `..`, leading/trailing/double slashes, absolute paths,
 * backslashes, and control characters — so a driver can map a key onto a
 * filesystem path (or an S3 object name) without risk of traversal.
 */

import { StorageError } from './types';

/**
 * One key segment: starts with an alphanumeric, then alphanumerics, dot,
 * dash, or underscore. Notably `.` and `..` do not match (they start with a
 * dot), so relative-path traversal is impossible.
 */
const KEY_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Generous upper bound on total key length, well under filesystem limits. */
const MAX_KEY_LENGTH = 1024;

/** Whether `key` is a well-formed, safe storage key. */
export function isValidKey(key: string): boolean {
	if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
		return false;
	}
	return key.split('/').every((segment) => KEY_SEGMENT.test(segment));
}

/** Throw {@link StorageError} unless `key` is a well-formed, safe storage key. */
export function assertValidKey(key: string): void {
	if (!isValidKey(key)) {
		throw new StorageError(`Invalid storage key: ${JSON.stringify(key)}`);
	}
}

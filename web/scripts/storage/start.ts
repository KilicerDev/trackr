#!/usr/bin/env bun
/**
 * Starts the shared local MinIO container (`dev-minio`) and ensures this
 * project's bucket exists inside it. Idempotent — safe to run any time.
 *
 * Mirrors the shared dev-postgres pattern (`scripts/db/start.ts`): one MinIO
 * container is shared across every project on this machine, each project gets
 * its own bucket (named after the project), so projects don't fight over port
 * 9000 or each other's objects.
 *
 * The bucket name is this project's `package.json` name (`$npm_package_name`).
 * `S3_BUCKET` in `.env` must match it (the default already does).
 */
import { $ } from 'bun';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

const CONTAINER = 'dev-minio';
const ENDPOINT = 'http://localhost:9000';
const ACCESS_KEY = 'minioadmin';
const SECRET_KEY = 'minioadmin';

const bucket = process.env.npm_package_name;

if (!bucket) {
	console.error('npm_package_name is not set — run this via `bun run s3:start`.');
	process.exit(1);
}

// Start the shared container; create it on first run if it doesn't exist yet.
const started = await $`docker start ${CONTAINER}`.nothrow().quiet();
if (started.exitCode !== 0) {
	console.log('Creating shared dev-minio container…');
	// Pass the args as an array, not a `\`-continued multi-line string: Bun's $
	// keeps the leading indentation of a continued line and globs that tab onto
	// the next token (here, the image ref), which Docker rejects with "invalid
	// reference format". Array elements each become their own escaped argument.
	const runArgs = [
		'run',
		'-d',
		'--name',
		CONTAINER,
		'-e',
		`MINIO_ROOT_USER=${ACCESS_KEY}`,
		'-e',
		`MINIO_ROOT_PASSWORD=${SECRET_KEY}`,
		'-p',
		'127.0.0.1:9000:9000',
		'-p',
		'127.0.0.1:9001:9001',
		'-v',
		'dev-minio-data:/data',
		'minio/minio:latest',
		'server',
		'/data',
		'--console-address',
		':9001'
	];
	await $`docker ${runArgs}`;
}

// Wait for MinIO to report ready before creating the bucket.
const deadline = Date.now() + 30_000;
for (;;) {
	try {
		const res = await fetch(`${ENDPOINT}/minio/health/ready`);
		if (res.ok) break;
	} catch {
		// container still starting — keep polling
	}
	if (Date.now() > deadline) {
		console.error('dev-minio did not become ready within 30s.');
		process.exit(1);
	}
	await Bun.sleep(500);
}

// Ensure this project's bucket exists. Reuses the @aws-sdk/client-s3 dependency
// the app already ships, so no `mc` container is needed.
const s3 = new S3Client({
	endpoint: ENDPOINT,
	region: 'us-east-1',
	forcePathStyle: true,
	credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
});

try {
	await s3.send(new CreateBucketCommand({ Bucket: bucket }));
} catch (err) {
	const name = (err as { name?: string })?.name;
	// Already created (by us or a previous run) — that's the idempotent path.
	if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
		throw err;
	}
}

console.log(`✓ dev-minio running — bucket "${bucket}" ready (console: http://localhost:9001)`);

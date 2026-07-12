/**
 * Job queue — public API.
 *
 * The low-level core (`createJob`, `defineJob`, `listJobs`, …) plus the
 * per-domain job definitions and producers under `./services/*`. Import from
 * here: `import { sendEmail, EMAIL_PRIORITY, createJob } from '$lib/server/jobs';`.
 */

export * from './core';
export * from './services/mail';
export * from './services/prune';
export * from './services/cleanup';
export * from './services/digest';

import type { MailPayload } from './services/mail';
import type { PrunePayload } from './services/prune';
import type { NotifyDigestPayload } from './services/digest';

/**
 * The job type → payload contract — the single source of truth the Go worker
 * mirrors (`services/worker/internal/jobs`). Assembled from the per-domain
 * definitions; add a line here when you add a job service. There is no codegen,
 * so keep the Go handler's payload struct in sync with the matching type.
 */
export type JobPayloads = {
	'mail.send': MailPayload;
	'prune.jobs': PrunePayload;
	'prune.invitations': PrunePayload;
	'prune.notifications': PrunePayload;
	'notify.digest': NotifyDigestPayload;
};

export type JobType = keyof JobPayloads;

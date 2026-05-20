// Central writer for the project activity feed. Every event (field changes,
// membership, task lifecycle, time logs, comments) flows through `logActivity`
// so there is one insert path and one place to evolve the row shape.
//
// Pass a transaction as `tx` to enlist the write in an existing
// `db.transaction(...)` block (task create/update do this so the event commits
// atomically with the mutation). Outside a transaction, omit it and use
// `logActivityFF` for fire-and-forget writes that must never undo the action
// they describe.

import { db } from './db';
import { projectActivity, type ProjectActivityType, type ProjectActivityMeta } from './db/app.schema';

type Db = typeof db;
// Drizzle's transaction callback parameter — structurally a subset of `db`.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export type LogActivityInput = {
	projectId: string;
	taskId?: string | null;
	actorId?: string | null;
	type: ProjectActivityType;
	body?: string | null;
	meta?: ProjectActivityMeta | null;
};

export async function logActivity(exec: Executor, input: LogActivityInput): Promise<void> {
	await exec.insert(projectActivity).values({
		id: crypto.randomUUID(),
		projectId: input.projectId,
		taskId: input.taskId ?? null,
		actorId: input.actorId ?? null,
		type: input.type,
		body: input.body ?? null,
		meta: input.meta ?? null
	});
}

// Fire-and-forget variant for call sites outside a transaction: logs the error
// but never rejects, so a failed activity write can't surface as a failed
// action.
export function logActivityFF(input: LogActivityInput): void {
	void logActivity(db, input).catch((err) => console.error('logActivity failed', err));
}

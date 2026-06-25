ALTER TABLE "message" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_entity_unique" ON "thread" USING btree ("subject_type","subject_id") WHERE "thread"."subject_type" in ('ticket', 'task');--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
-- Ticket migration: one thread per ticket, copy ticket_message → message
-- (ids preserved so attachments only need re-keying), preserving the internal
-- flag. Ticket UI is unchanged; this just moves the data onto the unified core.
WITH nt AS (
	INSERT INTO "thread" (id, subject_type, subject_id, title, status, created_by, created_at, updated_at)
	SELECT gen_random_uuid()::text, 'ticket', t.id, t.subject, 'open', t.created_by, t.created_at, t.updated_at
	FROM "ticket" t
	RETURNING id AS thread_id, subject_id AS ticket_id
)
INSERT INTO "message" (id, thread_id, author_id, body, kind, internal, created_at, updated_at)
SELECT tm.id, nt.thread_id, tm.author_id, tm.body, 'comment', tm.is_internal_note, tm.created_at, tm.updated_at
FROM "ticket_message" tm
JOIN nt ON nt.ticket_id = tm.ticket_id;--> statement-breakpoint
UPDATE "attachment" SET entity_type = 'message'
WHERE entity_type = 'ticket_message' AND entity_id IN (SELECT id FROM "message");
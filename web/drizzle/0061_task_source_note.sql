ALTER TABLE "task" ADD COLUMN "source_note_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_source_note_id_note_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."note"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_source_note_idx" ON "task" USING btree ("source_note_id");
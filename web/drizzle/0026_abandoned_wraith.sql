ALTER TABLE "task" ADD COLUMN "source_ticket_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_source_ticket_id_ticket_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."ticket"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_source_ticket_idx" ON "task" USING btree ("source_ticket_id");
ALTER TABLE "ticket" ADD COLUMN "source_thread_id" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_source_thread_id_thread_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_source_thread_idx" ON "ticket" USING btree ("source_thread_id");
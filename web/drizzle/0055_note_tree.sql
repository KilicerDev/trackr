ALTER TABLE "note" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_parent_id_note_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_parent_idx" ON "note" USING btree ("parent_id","sort_order");
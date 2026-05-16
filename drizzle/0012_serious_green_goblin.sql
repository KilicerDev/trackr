CREATE TABLE "wiki_page" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"icon" text DEFAULT 'book' NOT NULL,
	"is_folder" boolean DEFAULT false NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_id" text,
	"updated_by_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_parent_id_wiki_page_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_page_parent_idx" ON "wiki_page" USING btree ("parent_id","sort_order");
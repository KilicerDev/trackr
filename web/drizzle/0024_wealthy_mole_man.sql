CREATE TABLE "ticket_favorite" (
	"user_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_favorite_user_id_ticket_id_pk" PRIMARY KEY("user_id","ticket_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_favorite" ADD CONSTRAINT "ticket_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_favorite" ADD CONSTRAINT "ticket_favorite_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_favorite_ticket_idx" ON "ticket_favorite" USING btree ("ticket_id");
CREATE TABLE "ticket_assignee" (
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_assignee_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ticket" DROP CONSTRAINT "ticket_assigned_agent_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "ticket_assignee_idx";--> statement-breakpoint
ALTER TABLE "ticket_assignee" ADD CONSTRAINT "ticket_assignee_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignee" ADD CONSTRAINT "ticket_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_assignee_user_idx" ON "ticket_assignee" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "ticket_assignee" ("ticket_id", "user_id")
	SELECT "id", "assigned_agent_id" FROM "ticket" WHERE "assigned_agent_id" IS NOT NULL
	ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "ticket" DROP COLUMN "assigned_agent_id";
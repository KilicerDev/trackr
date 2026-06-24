ALTER TABLE "invitation" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
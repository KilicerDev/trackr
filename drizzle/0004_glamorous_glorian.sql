CREATE TABLE "task_planning" (
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"planned_for" date NOT NULL,
	"order_in_day" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_planning_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_planning" ADD CONSTRAINT "task_planning_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_planning" ADD CONSTRAINT "task_planning_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_planning_user_day_idx" ON "task_planning" USING btree ("user_id","planned_for");
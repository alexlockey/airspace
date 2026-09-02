CREATE TABLE "backlink_recent_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"domain_from" text,
	"url_from" text,
	"url_to" text,
	"anchor" text,
	"spam_score" integer,
	"rank" integer,
	"domain_from_rank" integer,
	"is_dofollow" boolean,
	"first_seen" text,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlink_recent_links" ADD CONSTRAINT "backlink_recent_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlink_recent_links_project_idx" ON "backlink_recent_links" USING btree ("project_id");
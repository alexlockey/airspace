CREATE TABLE "domain_authority_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"value" real NOT NULL,
	"referring_domains" integer,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_cache" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"computed_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_authority_points" ADD CONSTRAINT "domain_authority_points_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_authority_points_project_source_date_idx" ON "domain_authority_points" USING btree ("project_id","source","date");
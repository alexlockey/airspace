CREATE TABLE `domain_authority_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`source` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`referring_domains` integer,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_authority_points_project_source_date_idx` ON `domain_authority_points` (`project_id`,`source`,`date`);--> statement-breakpoint
CREATE TABLE `portfolio_cache` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`computed_at` text NOT NULL
);

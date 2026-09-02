CREATE TABLE `backlink_recent_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`domain_from` text,
	`url_from` text,
	`url_to` text,
	`anchor` text,
	`spam_score` integer,
	`rank` integer,
	`domain_from_rank` integer,
	`is_dofollow` integer,
	`first_seen` text,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backlink_recent_links_project_idx` ON `backlink_recent_links` (`project_id`);
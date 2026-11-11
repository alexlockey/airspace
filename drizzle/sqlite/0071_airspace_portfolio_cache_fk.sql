PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_portfolio_cache` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Airspace fork: the stored portfolio is a cache, so it is not copied across. D1 keeps
-- foreign keys on inside migrations, and an orphaned row would fail the whole migration;
-- the scheduler rebuilds the copy within the hour.
DROP TABLE `portfolio_cache`;--> statement-breakpoint
ALTER TABLE `__new_portfolio_cache` RENAME TO `portfolio_cache`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
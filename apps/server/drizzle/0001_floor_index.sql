CREATE TABLE `floors` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_floors_tournament` ON `floors` (`tournament_id`);--> statement-breakpoint
ALTER TABLE `matches` ADD `floor_id` text;--> statement-breakpoint
CREATE INDEX `idx_matches_floor` ON `matches` (`floor_id`);
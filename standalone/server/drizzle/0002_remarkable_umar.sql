CREATE TABLE `floor_sessions` (
	`floor_id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`match_id` text,
	`snapshot` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_floor_sessions_tournament` ON `floor_sessions` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `idx_floor_sessions_match` ON `floor_sessions` (`match_id`);
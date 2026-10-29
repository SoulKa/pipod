CREATE TABLE `participant_photos` (
	`participant_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `participants` ADD `avatar` text;
CREATE TABLE `participant_photos` (
	`participant_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `participants` ADD `avatar` text;
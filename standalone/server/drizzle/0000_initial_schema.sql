CREATE TABLE IF NOT EXISTS `group_members` (
	`group_id` text NOT NULL,
	`participant_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legs` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`index` integer NOT NULL,
	`start_score` integer NOT NULL,
	`out_mode` text NOT NULL,
	`winner_id` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_legs_match` ON `legs` (`match_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`group_id` text,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`participant_a_id` text,
	`participant_b_id` text,
	`best_of` integer NOT NULL,
	`start_score` integer NOT NULL,
	`out_mode` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`legs_a` integer DEFAULT 0 NOT NULL,
	`legs_b` integer DEFAULT 0 NOT NULL,
	`winner_id` text,
	`next_match_id` text,
	`next_slot` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_matches_tournament` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_matches_stage` ON `matches` (`stage_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`seed` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_participants_tournament` ON `participants` (`tournament_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`format` text NOT NULL,
	`order` integer NOT NULL,
	`best_of` integer NOT NULL,
	`start_score` integer NOT NULL,
	`out_mode` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stages_tournament` ON `stages` (`tournament_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `throws` (
	`id` text PRIMARY KEY NOT NULL,
	`leg_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`dart_index` integer NOT NULL,
	`base` integer NOT NULL,
	`multiplier` integer NOT NULL,
	`points` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_throws_leg` ON `throws` (`leg_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'setup' NOT NULL,
	`created_at` text NOT NULL
);

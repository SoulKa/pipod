ALTER TABLE `matches` ADD `queue_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `auto_assign` integer DEFAULT false NOT NULL;
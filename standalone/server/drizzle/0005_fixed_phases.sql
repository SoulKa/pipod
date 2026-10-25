-- Free-form stages become fixed phases: at most one group phase, then at most one
-- knockout phase, with their settings stored instead of passed at generation time.
ALTER TABLE `stages` ADD `group_count` integer;--> statement-breakpoint
ALTER TABLE `stages` ADD `qualifiers_per_group` integer;--> statement-breakpoint
-- Free-form stages only migrate if they already have the fixed shape: at most one stage
-- per type, a knockout never ordered before the group phase, and no bracket drawn while
-- group matches were still open. Anything else stops here — the whole migration rolls
-- back and the server refuses to start, naming the broken rule. Fix the rows by hand.
CREATE TEMP TABLE `fixed_phases_guard` (`duplicates` integer CONSTRAINT `at_most_one_stage_per_type_per_tournament` CHECK (`duplicates` = 0), `misordered` integer CONSTRAINT `knockout_stage_must_come_after_group_stage` CHECK (`misordered` = 0), `overlapping` integer CONSTRAINT `knockout_drawn_before_group_phase_finished` CHECK (`overlapping` = 0));--> statement-breakpoint
INSERT INTO `fixed_phases_guard` VALUES ((SELECT COUNT(*) FROM (SELECT 1 FROM `stages` GROUP BY `tournament_id`, `type` HAVING COUNT(*) > 1)), (SELECT COUNT(*) FROM `stages` AS `k` JOIN `stages` AS `g` ON `g`.`tournament_id` = `k`.`tournament_id` AND `g`.`type` = 'group' WHERE `k`.`type` = 'knockout' AND `k`.`order` < `g`.`order`), (SELECT COUNT(*) FROM `matches` AS `km` JOIN `stages` AS `k` ON `k`.`id` = `km`.`stage_id` AND `k`.`type` = 'knockout' WHERE EXISTS (SELECT 1 FROM `matches` AS `gm` JOIN `stages` AS `g` ON `g`.`id` = `gm`.`stage_id` AND `g`.`type` = 'group' WHERE `gm`.`tournament_id` = `km`.`tournament_id` AND `gm`.`status` <> 'completed')));--> statement-breakpoint
DROP TABLE `fixed_phases_guard`;--> statement-breakpoint
-- Recover the group count from the groups that were generated (1 when none were), and
-- assume the console's old default of two qualifiers for a knockout after a group phase.
UPDATE `stages` SET `group_count` = MAX(1, (SELECT COUNT(*) FROM `groups` WHERE `groups`.`stage_id` = `stages`.`id`)) WHERE `type` = 'group';--> statement-breakpoint
UPDATE `stages` SET `qualifiers_per_group` = 2 WHERE `type` = 'knockout' AND EXISTS (SELECT 1 FROM `stages` AS `g` WHERE `g`.`tournament_id` = `stages`.`tournament_id` AND `g`.`type` = 'group');--> statement-breakpoint
DROP INDEX `idx_stages_tournament`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_stages_tournament_type` ON `stages` (`tournament_id`,`type`);--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `format`;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `order`;

-- Retried leg reports could insert the same leg twice before reportLeg became
-- idempotent. Drop those duplicates (keeping the first row per leg number) so the
-- unique index can be created on databases that already collected some.
DELETE FROM `legs` WHERE `rowid` NOT IN (SELECT MIN(`rowid`) FROM `legs` GROUP BY `match_id`, `index`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_legs_match_index` ON `legs` (`match_id`,`index`);

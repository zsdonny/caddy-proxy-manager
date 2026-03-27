CREATE TABLE `waf_rule_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`directives` text NOT NULL,
	`is_preset` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waf_rule_sets_name_unique` ON `waf_rule_sets` (`name`);

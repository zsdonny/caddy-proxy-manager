CREATE TABLE `traffic_rollups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `hour_bucket` integer NOT NULL,
  `host` text NOT NULL DEFAULT '',
  `country_code` text,
  `proto` text NOT NULL DEFAULT '',
  `user_agent` text NOT NULL DEFAULT '',
  `total_requests` integer NOT NULL DEFAULT 0,
  `blocked_requests` integer NOT NULL DEFAULT 0,
  `unique_ips` integer NOT NULL DEFAULT 0,
  `bytes_sent` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_traffic_rollups_hour` ON `traffic_rollups` (`hour_bucket`);--> statement-breakpoint
CREATE UNIQUE INDEX `traffic_rollups_unique` ON `traffic_rollups` (`hour_bucket`,`host`,`country_code`,`proto`,`user_agent`);--> statement-breakpoint
CREATE TABLE `waf_rollups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `hour_bucket` integer NOT NULL,
  `host` text NOT NULL DEFAULT '',
  `country_code` text,
  `rule_id` integer,
  `rule_message` text,
  `total_events` integer NOT NULL DEFAULT 0,
  `muted_events` integer NOT NULL DEFAULT 0,
  `unmuted_events` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_waf_rollups_hour` ON `waf_rollups` (`hour_bucket`);--> statement-breakpoint
CREATE UNIQUE INDEX `waf_rollups_unique` ON `waf_rollups` (`hour_bucket`,`host`,`country_code`,`rule_id`);

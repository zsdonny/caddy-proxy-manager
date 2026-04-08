CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_prefs_user_key_unique` ON `user_preferences` (`user_id`,`key`);
--> statement-breakpoint
CREATE INDEX `user_prefs_user_id_idx` ON `user_preferences` (`user_id`);

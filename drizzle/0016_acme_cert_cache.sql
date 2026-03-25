CREATE TABLE IF NOT EXISTS `acme_cert_cache` (
	`domain` text PRIMARY KEY NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL,
	`issuer` text NOT NULL,
	`san_domains` text NOT NULL,
	`probed_at` text NOT NULL,
	`probe_target` text NOT NULL
);

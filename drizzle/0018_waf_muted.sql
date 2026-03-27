ALTER TABLE waf_events ADD COLUMN muted integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX idx_waf_events_muted_ts ON waf_events (muted, ts);

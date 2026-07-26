-- Lightweight first-party analytics (pageviews + device/region)
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'pageview' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`post_id` text,
	`device` text DEFAULT 'unknown' NOT NULL,
	`region` text DEFAULT 'XX' NOT NULL,
	`visitor_key` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_events_created_at_idx` ON `analytics_events` (`created_at`);
--> statement-breakpoint
CREATE INDEX `analytics_events_post_id_idx` ON `analytics_events` (`post_id`);
--> statement-breakpoint
CREATE INDEX `analytics_events_device_idx` ON `analytics_events` (`device`);
--> statement-breakpoint
CREATE INDEX `analytics_events_region_idx` ON `analytics_events` (`region`);

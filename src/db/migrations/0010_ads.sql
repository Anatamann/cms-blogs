CREATE TABLE `ads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'promo' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`link_url` text DEFAULT '' NOT NULL,
	`adsense_client` text DEFAULT '' NOT NULL,
	`adsense_slot` text DEFAULT '' NOT NULL,
	`adsense_format` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ads_status_idx` ON `ads` (`status`);
--> statement-breakpoint
CREATE INDEX `ads_type_idx` ON `ads` (`type`);
--> statement-breakpoint
CREATE TABLE `post_ad_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`ad_id` text NOT NULL,
	`show_desktop` integer DEFAULT 1 NOT NULL,
	`mobile_slot` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_ad_placements_post_id_idx` ON `post_ad_placements` (`post_id`);
--> statement-breakpoint
CREATE INDEX `post_ad_placements_ad_id_idx` ON `post_ad_placements` (`ad_id`);

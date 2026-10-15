CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`cached_image_path` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT 'generic' NOT NULL,
	`aspect_ratio` text DEFAULT 'square' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`preview_fetched_at` text,
	`preview_raw` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `social_posts_status_idx` ON `social_posts` (`status`);
--> statement-breakpoint
CREATE INDEX `social_posts_sort_order_idx` ON `social_posts` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `social_home_pins` (
	`id` text PRIMARY KEY NOT NULL,
	`social_post_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`social_post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_home_pins_post_uq` ON `social_home_pins` (`social_post_id`);
--> statement-breakpoint
CREATE INDEX `social_home_pins_sort_idx` ON `social_home_pins` (`sort_order`);

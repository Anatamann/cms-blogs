CREATE TABLE `post_hyperlinks` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`word` text NOT NULL,
	`url` text NOT NULL,
	`max_occurrences` integer,
	`linked_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_hyperlinks_post_word_uq` ON `post_hyperlinks` (`post_id`,`word`);
--> statement-breakpoint
CREATE INDEX `post_hyperlinks_post_id_idx` ON `post_hyperlinks` (`post_id`);

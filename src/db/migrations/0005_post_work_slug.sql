ALTER TABLE `posts` ADD `work_slug` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_work_slug_idx` ON `posts` (`work_slug`);

-- Rename category URL slugs for /{category}/{post} routes
UPDATE `categories` SET `slug` = 'review' WHERE `slug` = 'reviews';
--> statement-breakpoint
UPDATE `categories` SET `slug` = 'fan-theory' WHERE `slug` = 'fan-theories';

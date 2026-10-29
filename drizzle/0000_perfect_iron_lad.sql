CREATE TABLE `answer_events` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`question_id` text NOT NULL,
	`response` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);

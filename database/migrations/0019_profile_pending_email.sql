ALTER TABLE "users" ADD COLUMN "pending_email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_otp_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_otp_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_otp_attempts" integer DEFAULT 0 NOT NULL;
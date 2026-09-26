CREATE TYPE "public"."limit_period" AS ENUM('day', 'week', 'month', 'lifetime');--> statement-breakpoint
CREATE TABLE "limit_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"unit" varchar(50) DEFAULT 'count' NOT NULL,
	"period_type" "limit_period" DEFAULT 'month' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "limit_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "package_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"limit_definition_id" uuid NOT NULL,
	"limit_value" integer,
	"period_type" "limit_period" DEFAULT 'month' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "package_limits_package_limit_unique" UNIQUE("package_id","limit_definition_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid,
	"metric_key" varchar(100) NOT NULL,
	"usage_value" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_user_metric_period_unique" UNIQUE("user_id","metric_key","period_start")
);
--> statement-breakpoint
ALTER TABLE "package_limits" ADD CONSTRAINT "package_limits_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_limits" ADD CONSTRAINT "package_limits_limit_definition_id_limit_definitions_id_fk" FOREIGN KEY ("limit_definition_id") REFERENCES "public"."limit_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "limit_definitions_key_idx" ON "limit_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "package_limits_package_id_idx" ON "package_limits" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "usage_records_user_metric_period_idx" ON "usage_records" USING btree ("user_id","metric_key","period_start");
CREATE TYPE "public"."locale" AS ENUM('uk', 'en', 'ru');--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "locale" "locale";
CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb,
	"tx" text
);
--> statement-breakpoint
CREATE TABLE "caps_ledger" (
	"payer" text NOT NULL,
	"day" text NOT NULL,
	"open_tasks" integer DEFAULT 0 NOT NULL,
	"daily_units" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "caps_ledger_payer_day_pk" PRIMARY KEY("payer","day")
);
--> statement-breakpoint
CREATE TABLE "direct_quotes" (
	"spec_hash" text PRIMARY KEY NOT NULL,
	"payer" text NOT NULL,
	"post_params_json" jsonb NOT NULL,
	"total_units" bigint NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"task_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency" (
	"auth_nonce" text PRIMARY KEY NOT NULL,
	"task_id" bigint,
	"settle_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idkit_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"nullifier" text NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marks_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payer" text NOT NULL,
	"agent_id_claimed" text,
	"agent_id" text,
	"class" text NOT NULL,
	"spec_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"tx" text
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"key_role" text PRIMARY KEY NOT NULL,
	"next_nonce" bigint NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nullifiers" (
	"nullifier" numeric(78, 0) PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"worker" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"observation_id" text PRIMARY KEY NOT NULL,
	"place_key" text NOT NULL,
	"claim_type" text NOT NULL,
	"claim_value" text NOT NULL,
	"evidence_hash" text,
	"worker_nullifier" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"confidence" numeric,
	"task_id" bigint NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"geohash5" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posters" (
	"payer" text PRIMARY KEY NOT NULL,
	"agent_id" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"allowlisted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proofs" (
	"hash" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"exact_lat" numeric,
	"exact_lon" numeric,
	"exact_accuracy_m" numeric,
	"gps_unavailable" boolean DEFAULT false NOT NULL,
	"worker" text NOT NULL,
	"task_id" bigint,
	"place_id" text
);
--> statement-breakpoint
CREATE TABLE "screening_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_type" text NOT NULL,
	"class" text,
	"reason" text NOT NULL,
	"rule_id" text NOT NULL,
	"spec_hash" text NOT NULL,
	"marked" boolean DEFAULT false NOT NULL,
	"mark_tx" text,
	"agent_id" text,
	"payer" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"worker" text NOT NULL,
	"nullifier" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"task_id" bigint PRIMARY KEY NOT NULL,
	"task_type" integer NOT NULL,
	"spec_hash" text NOT NULL,
	"amount_units" bigint NOT NULL,
	"fee_units" bigint NOT NULL,
	"buyer" text NOT NULL,
	"buyer_agent_id" text,
	"area" text NOT NULL,
	"worker" text,
	"state" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"proof_hash" text,
	"claim_ttl_s" integer NOT NULL,
	"submit_ttl_s" integer NOT NULL,
	"dispute_window_s" integer NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"answer" text,
	"note" text,
	"dispute_reason" text,
	"auto_dispute_reason" text,
	"tx_post" text,
	"tx_claim" text,
	"tx_submit" text,
	"tx_release" text,
	"spec_json" jsonb NOT NULL,
	"buyer_token_hash" text NOT NULL,
	"exact_lat" numeric,
	"exact_lon" numeric,
	"agent_id" text,
	"payer" text NOT NULL,
	"auth_nonce" text,
	"price_units" bigint NOT NULL,
	"float_absorbed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nullifiers_worker_uq" ON "nullifiers" USING btree ("worker");--> statement-breakpoint
CREATE INDEX "observations_place_idx" ON "observations" USING btree ("place_key");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tasks_area_idx" ON "tasks" USING btree ("area");--> statement-breakpoint
CREATE INDEX "tasks_payer_idx" ON "tasks" USING btree ("payer");
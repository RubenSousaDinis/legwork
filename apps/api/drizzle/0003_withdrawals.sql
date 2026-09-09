CREATE TABLE "withdrawals" (
	"payout_nonce" text PRIMARY KEY NOT NULL,
	"fee_nonce" text NOT NULL,
	"worker" text NOT NULL,
	"destination" text NOT NULL,
	"amount_units" bigint NOT NULL,
	"payout_units" bigint NOT NULL,
	"fee_units" bigint NOT NULL,
	"payout_tx" text,
	"fee_tx" text,
	"fee_pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

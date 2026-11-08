CREATE TABLE "wallet_favorites" (
	"wallet" text,
	"pool" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_favorites_pkey" PRIMARY KEY("wallet","pool")
);

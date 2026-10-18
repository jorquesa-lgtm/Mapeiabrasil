/*
  # Fix: payments never recorded — missing unique index on stripe_session_id

  The Stripe webhook saves payments with:
    supabase.from("subscriptions").upsert(row, { onConflict: "stripe_session_id" })

  PostgREST's ON CONFLICT needs a UNIQUE constraint (or unique index) on the
  conflict column. `subscriptions.stripe_session_id` only had a *non-unique*
  index (idx_subs_session), so every upsert failed with error 42P10
  ("no unique or exclusion constraint matching the ON CONFLICT specification").
  The webhook did not check the returned error and still responded 200, so
  Stripe marked the event delivered and the row was silently dropped. Result:
  zero subscriptions ever written, even for completed payments.

  Fix: replace the non-unique index with a UNIQUE index on stripe_session_id.
  The table is empty, so this is safe to apply directly. Every real Stripe
  checkout has a distinct session id; the access-code path sets a distinct
  synthetic id per redemption (see activate-kit-code), so no collisions.
*/

DROP INDEX IF EXISTS idx_subs_session;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_session_id_key
  ON subscriptions (stripe_session_id);

-- Upmore migration 20260923_000003: routes platform deep links.
-- ios_url / android_url hold verified official app-store links so the app can
-- send each platform straight to the right store page. Populated only from
-- verified official URLs — never guessed. Idempotent.

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS ios_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS android_url text NOT NULL DEFAULT '';

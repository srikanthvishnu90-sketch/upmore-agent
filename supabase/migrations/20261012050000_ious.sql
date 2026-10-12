-- IOU log (megadoc C05 "jake owes me 20", D08 "log that I owe mom 200", D09 "what do I owe people", D10 "mark mom's 200 as
-- paid"): what the person says they owe or are owed, kept in their own words (packages/domain/105-iou-log.js) and
-- restated back exactly. A note only: nothing is paid, requested or sent to anyone, and no account is read or changed.
--
-- Its own column in the person's settings row, with the shape the table holds itself to whatever the caller:
--   an array of at most 40 entries               each with a name (text), a direction (i_owe or owes_me), a whole
--                                                number of cents above 0 and at most $100,000, and a status (open or
--                                                settled)
--   never an identity or card number             no run of 9 or more digits anywhere, as in watches
--   bounded                                      at most 16000 characters in all
-- Row-level security is unchanged: the owner-only policy of 20261011060000_proactive.sql covers the new column.
-- Idempotent, like the other migrations: it can run twice.
alter table public.agent_proactive_settings add column if not exists ious jsonb not null default '[]'::jsonb;

alter table public.agent_proactive_settings drop constraint if exists agent_proactive_settings_ious_shape;
alter table public.agent_proactive_settings add constraint agent_proactive_settings_ious_shape check (
  jsonb_typeof(ious) = 'array'
  and jsonb_array_length(ious) <= 40
  and length(ious::text) <= 16000
  and ious::text !~ '\d{9,}'
  and not jsonb_path_exists(ious, '$[*] ? (!exists(@.name) || @.name.type() != "string")')
  and not jsonb_path_exists(ious, '$[*] ? (!(@.direction == "i_owe" || @.direction == "owes_me"))')
  and not jsonb_path_exists(ious, '$[*] ? (!(@.status == "open" || @.status == "settled"))')
  and not jsonb_path_exists(ious, '$[*] ? (!exists(@.amount_cents) || @.amount_cents.type() != "number" || @.amount_cents <= 0 || @.amount_cents > 10000000 || @.amount_cents != @.amount_cents.floor())')
);

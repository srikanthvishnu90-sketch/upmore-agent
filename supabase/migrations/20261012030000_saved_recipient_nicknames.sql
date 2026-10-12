-- Saved nicknames for recipients (response-style corpus 1.06: "send mom 100" pays Anita Srikanth). The person's own word for
-- someone they have already paid or confirmed, set only by an explicit message restated back and saved on a yes
-- (packages/domain/42-agent-recipients.js, nicknames()). Resolution matches it exactly, never fuzzily; cards show the real
-- name with it ("Anita Srikanth (mom, @anitas)").
--
-- The rules the table holds itself to, whatever the caller:
--   a word, never identity digits or a handle   lowercase letters, a space or an apostrophe; no digits, no @ $ _ . at all
--   bounded                                     2 to 24 characters, no leading, trailing or doubled spaces
--   one meaning per person                      a nickname is unique per user ("mom" is one recipient for that user);
--                                               another user's "mom" is theirs
-- Row-level security is unchanged: the owner-only policies of 20261011020000_saved_recipients.sql cover the new column.
-- Idempotent, like the other migrations: it can run twice.
alter table public.saved_recipients add column if not exists nickname text;

alter table public.saved_recipients drop constraint if exists saved_recipients_nickname_shape;
alter table public.saved_recipients add constraint saved_recipients_nickname_shape check (
  nickname is null or (
    nickname = lower(nickname)
    and length(nickname) between 2 and 24
    and nickname ~ '^[a-z][a-z'' ]*[a-z]$'
    and nickname !~ '  '
  )
);

create unique index if not exists saved_recipients_nickname_unique
  on public.saved_recipients (user_id, nickname) where nickname is not null;

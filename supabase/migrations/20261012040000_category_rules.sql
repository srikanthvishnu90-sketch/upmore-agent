-- Category rules (owner's capability list item 8; megadoc L07 "recategorize Target as groceries"): a person moves a
-- merchant into one of the categories the chat counts, by saying so in chat (packages/domain/95-category-rules.js,
-- restated back exactly). Every later spending answer and category budget counts that merchant's charges there. It changes
-- how Upmore counts, never anything at the bank or card, and never moves money.
--
-- Its own column, apart from watches (which holds at most 20 and is shared with alerts and budgets), with the rules the
-- table holds itself to whatever the caller:
--   an array of at most 40 rules               each an object with a term and one of the chat's categories
--   never an identity or card number            no run of 9 or more digits anywhere, as in watches (the code refuses a
--                                               term with 5 or more in a row and masks them in the words it keeps)
--   bounded                                     at most 12000 characters in all
-- Row-level security is unchanged: the owner-only policy of 20261011060000_proactive.sql covers the new column.
-- Idempotent, like the other migrations: it can run twice.
alter table public.agent_proactive_settings add column if not exists category_rules jsonb not null default '[]'::jsonb;

alter table public.agent_proactive_settings drop constraint if exists agent_proactive_settings_category_rules_shape;
alter table public.agent_proactive_settings add constraint agent_proactive_settings_category_rules_shape check (
  jsonb_typeof(category_rules) = 'array'
  and jsonb_array_length(category_rules) <= 40
  and length(category_rules::text) <= 12000
  and category_rules::text !~ '\d{9,}'
  and not jsonb_path_exists(category_rules, '$[*] ? (!(@.group == "delivery" || @.group == "groceries" || @.group == "restaurants" || @.group == "gas" || @.group == "subscriptions" || @.group == "transport" || @.group == "shopping"))')
  and not jsonb_path_exists(category_rules, '$[*] ? (!exists(@.term) || @.term.type() != "string")')
);

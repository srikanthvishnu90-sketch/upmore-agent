-- Gauntlet test user (2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3): the Alpaca Broker API PAPER sub-account the owner opened in
-- the sandbox for this user, as a bootstrap row in the per-user account model. No key or token is stored: the firm's
-- sandbox keys stay function secrets (ALPACA_BROKER_KEY_ID, ALPACA_BROKER_SECRET). paper = true is enforced by the table.
-- Run by scripts/launch/apply-rails-and-seed.sh only when ALPACA_PAPER_ACCOUNT_ID is set (psql variable :account_id).
-- Idempotent: running it twice changes nothing.
insert into public.brokerage_accounts (user_id, provider, kind, label, paper, account_id)
values ('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3', 'alpaca_broker', 'bootstrap', 'main', true, :'account_id')
on conflict (user_id, provider, label) do nothing;

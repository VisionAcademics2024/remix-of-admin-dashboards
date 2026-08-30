-- =============================================================================
-- Billing: a real "card" payment method.
--
-- The billing workbench splits invoicing into two separate runs, cash and card,
-- and records how each payment came in. The payment_method enum only had
-- cash / bank_transfer / other, so "card" had nowhere to live. Add it.
--
-- ADD VALUE runs outside a transaction on its own; it is idempotent via
-- IF NOT EXISTS, so re-running the migration is safe.
-- =============================================================================

alter type payment_method add value if not exists 'card';

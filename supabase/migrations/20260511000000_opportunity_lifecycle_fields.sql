-- Opportunity lifecycle fields
--
-- Why:
--   - 'deadline' is the application deadline, not the funding period.
--     Awarded opportunities need a separate expiration_date.
--   - The actual amount awarded can differ from the requested amount.
--   - Opportunities the team decides to drop need a 'dismissed' status
--     with a reason, separately from 'rejected' (rejected by the funder).
--   - Rejected opportunities can become eligible to reapply at a later
--     date; reapplication_date drives the auto-revive logic in the app.
--   - 'eligibility' is no longer captured — the LLM parse step gates by
--     M4W eligibility upstream (IRRELEVANT if not eligible, included if
--     ambiguous so a human can review).

alter type opportunity_status add value if not exists 'dismissed';

alter table opportunities
  add column if not exists expiration_date    text,
  add column if not exists amount_awarded     numeric(12, 2),
  add column if not exists dismissal_reason   text,
  add column if not exists reapplication_date text;

alter table opportunities drop column if exists eligibility;

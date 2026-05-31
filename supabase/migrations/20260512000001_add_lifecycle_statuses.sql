-- Lifecycle status additions
--
-- Why:
--   - 'on_hold' maps to the XLSX "On Hold" sheet: opportunities that have been
--     found but cannot be pursued yet (e.g. fund not open, eligibility check
--     pending, waiting for a partner). Different from 'dismissed' (we intend
--     to return to these).
--   - 'funds_received' tracks when money actually lands in the bank, distinct
--     from 'awarded' (the funder's decision letter). Needed for cash flow tracking
--     and matches the XLSX "Date Funding Received (Bank)" field.

alter type opportunity_status add value if not exists 'on_hold';
alter type opportunity_status add value if not exists 'funds_received';

-- Application tracking fields
--
-- Why:
--   Aligns the platform with the charity's existing XLSX process.
--   - submission_date: auto-set when an opportunity moves to 'submitted'
--   - expected_results_date: when the funder is expected to respond
--   - date_funding_received: when money lands in the bank (distinct from award notification)
--   - tranches: number of payment instalments
--   - purpose: funding purpose category (core / project / unrestricted / core_and_project)
--   - feedback: funder feedback on rejected / unsuccessful applications
--   - financial_year: budget year the application falls under (e.g. '2026-2027')

alter table opportunities
  add column if not exists submission_date        text,
  add column if not exists expected_results_date  text,
  add column if not exists date_funding_received  text,
  add column if not exists tranches               integer,
  add column if not exists purpose                text,
  add column if not exists feedback               text,
  add column if not exists financial_year         text;

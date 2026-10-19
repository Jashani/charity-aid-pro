# Email pipeline (`email_parsing`)

This package is the email pipeline. It reads funding emails from Outlook.
It finds and scores the funding opportunities. Then it adds them to the
Airtable table "Opportunities".

The full documentation is in the [root README](../README.md). It gives the
setup, the configuration, the Airtable fields and the troubleshooting.

This document uses ASD-STE100 (Simplified Technical English).

## Modules

| Module | Function |
|---|---|
| `run.py` | Command-line entry point. It does fetch → parse → score → write → mark as read. |
| `outlook.py` | Outlook login (MSAL device code) and email fetch (Microsoft Graph) |
| `llm.py` | OpenAI-compatible LLM client and `parse_email()` |
| `scoring.py` | Geography check, eligibility check, score and tags |
| `storage.py` | Airtable write. It adds new records and does not change records that are already in the table. |
| `schema.py` | Pydantic data models |
| `config.py` | Environment variables |
| `prompts/` | The LLM prompts: `profile.txt`, `parse.txt`, `geography.txt`, `score.txt` |
| `tests/` | Unit tests |

## Data flow

1. `outlook.fetch_recent()` gets the emails.
2. `llm.parse_email()` gives a classification and a list of
   `FundingOpportunity` objects.
3. `scoring.score_all()` sets the gating result, the score, the status and
   the tags.
4. `storage.store_parsed_email()` adds the opportunities to Airtable.
   `storage.opp_to_fields()` converts one opportunity to Airtable fields.
5. `outlook.mark_as_read()` marks the email as read.

## Rules for code changes

- If you add a field to `storage.opp_to_fields()`, add the same field in
  Airtable first. The field name must be the same.
- If you change the output fields of a prompt, change its JSON schema
  (`llm.py` or `scoring.py`) also.
- Keep the `Source ID` format `{emailId}#{idx}`. The pipeline uses it to
  prevent duplicate records.
- Do not connect to Outlook, the LLM or Airtable in the tests. Use a fake
  HTTP transport (see `tests/test_storage.py`).

## Tests

```sh
pip install -r email_parsing/requirements.txt pytest
pytest email_parsing/tests
```

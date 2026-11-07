# Charity Aid Pro

Charity Aid Pro is an email pipeline for Music4Wellbeing (M4W). The pipeline
reads funding emails from the funding mailbox. It finds the funding
opportunities in each email and gives each opportunity a score. Then it adds
the opportunities to the Airtable table "Opportunities".

This document uses ASD-STE100 (Simplified Technical English).

---

## 1. System overview

```
┌──────────────────────┐    ┌──────────────────────────┐    ┌───────────────────────────┐
│ Funding mailbox      │    │ Email pipeline           │    │ Airtable                  │
│ (personal Outlook)   │───▶│ GitHub Actions, daily    │───▶│ Base "Music4Wellbeing"    │
│                      │    │ 09:17 UTC                │    │ Table "Opportunities"     │
└──────────────────────┘    │ fetch → parse → score    │    │                           │
                            │ → write → mark as read   │    └───────────────────────────┘
                            └────────────┬─────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────┐
                            │ LLM (Groq, GPT-OSS 120B) │
                            └──────────────────────────┘
```

The system has these parts:

| Part | Function |
|---|---|
| Funding mailbox | A personal Outlook account. Funders send emails to this mailbox. |
| Email pipeline | A Python program (`email_parsing/`). A GitHub Actions workflow runs it one time each day. |
| LLM | A large language model. It reads each email and gives the opportunity data and the score. |
| Airtable | The "Opportunities" table keeps all opportunities. Your team works on them in Airtable. |

The pipeline does not send reminders. The team sets up reminders in a
different system.

---

## 2. Repository contents

```
charity-aid-pro/
├── email_parsing/                  # The email pipeline
│   ├── run.py                      # Command-line entry point
│   ├── outlook.py                  # Outlook login and email fetch (Microsoft Graph)
│   ├── llm.py                      # LLM client and email parse
│   ├── scoring.py                  # Geography check, eligibility check, score
│   ├── storage.py                  # Airtable write
│   ├── schema.py                   # Data models (Pydantic)
│   ├── config.py                   # Environment variables
│   ├── prompts/                    # The LLM prompts (see section 9)
│   └── tests/                      # Unit tests
└── .github/workflows/
    └── email-pipeline.yml          # Daily schedule (09:17 UTC)
```

---

## 3. The Airtable "Opportunities" table

The table is in the base "Music4Wellbeing". It has one record for each
opportunity.

> **CAUTION:** Do not rename or delete the fields in this table. The pipeline
> writes to the fields by name. If a field name changes, the pipeline stops.

| Field | Type | Value |
|---|---|---|
| Opportunity | Text | Programme name and funder name |
| Status | Single select | The pipeline sets `New`. Your team changes it after that (`On Hold`, `Research`, `In Progress` or `Opportunity Dismissed`). |
| Score | Number | 0 to 100. See section 6. |
| Funder | Text | Funder name |
| Programme | Text | Programme name |
| Deadline | Date | Application deadline. Empty if the email does not give a date. |
| Amount Min | Currency (£) | Minimum award. Empty if the email does not give one. |
| Amount Max | Currency (£) | Maximum award. If the email gives only one amount ("up to £5,000"), it is here. |
| Amount Typical | Currency | Typical or average award, if the email gives it. If the email gives only a range, the pipeline writes the midpoint. |
| Funding Type | Single select | Trust & Foundation (includes livery companies), Corporate, Local Authority, Central Government (includes Arts Council England), Lottery or Individual |
| Location | Text | Area where the funder accepts applications |
| Duration (Months) | Number | Length of the funding, from the email. Empty if the email does not give a length. |
| Description | Long text | Summary of the opportunity (2 or 3 sentences) |
| Website | URL | Link to the opportunity |
| Contact Name | Text | Contact person at the funder. The pipeline does not write the newsletter publisher (for example Idox or Funded), the person who forwarded the email, or M4W staff. |
| Contact Email | Email | Contact email address at the funder. Same rules as Contact Name. |
| Notes | Long text | Other information. If the deadline is not a date (for example, "end of March"), the pipeline writes it here. |
| Dismissal Reason | Single select | Your team sets it when it dismisses an opportunity. The pipeline does not write it. |
| Dismissal Notes | Long text | More information about the dismissal. Your team writes it. Older records have the LLM reasoning here. |
| Activity Score | Number | 0 to 100. See section 6. |
| Audience Score | Number | 0 to 100. See section 6. |
| Score Reasoning | Long text | The reason for the score, from the LLM |
| Scored At | Date and time | When the pipeline calculated the score |
| Date Found | Date and time | When the pipeline added the record |
| Email Subject | Text | Subject of the source email |
| Email From | Email | Sender of the source email |
| Email Received | Date and time | When the mailbox received the source email |
| Source ID | Text | Unique key: Outlook message ID + `#` + position in the email. The pipeline uses it to prevent duplicate records. Do not change it. |

### 3.1 Rules for records

- The pipeline only adds records. It does not change records that are
  already in the table. Your changes in Airtable are safe.
- If two emails give the same opportunity, the table gets two records.
  Delete the duplicate record manually.
- When you apply for an opportunity, add a record in "Grants & Funding".
  The "Opportunities" table does not record application data.
- The pipeline does not add opportunities that fail the geography check or
  the eligibility check (see section 6). They are only in the workflow log
  and in `parsed.json` (section 7.1). Thus all new records have the status
  `New`.
- Records added before November 2026 can have the status
  `Opportunity Dismissed` from the pipeline, and a value in the old field
  "Gating". The pipeline no longer writes "Gating". You can delete that
  field.
- The pipeline does not save the full email. To see the source email,
  search the mailbox for the Email Subject or the Funder.

### 3.2 Data from the old system

Before October 2026, the pipeline wrote to a Supabase database. All 52
records from that database are now in the "Opportunities" table.

- The Source ID of each old record is the old Supabase ID.
- Application data from the old website (submission date, amount awarded,
  and so on) is in the Notes field. The text starts with "Tracking data from
  the old website".
- Two old records are test data: Source ID `Test1` and
  `custom-1778511453619`. You can delete them.

---

## 4. How the pipeline works

The pipeline does these steps for each run:

1. **Fetch.** The pipeline gets the most recent unread emails from the
   Outlook inbox. It uses Microsoft Graph.
2. **Skip.** If the table already has a record from the email, the pipeline
   does not process the email again.
3. **Parse.** The LLM reads each email. It gives a classification
   (`FUNDING_OPPORTUNITY`, `NEWSLETTER` or `IRRELEVANT`) and a list of
   opportunities. For a newsletter or an irrelevant email, the list is empty.
   If the email gives the same opportunity two times, the pipeline keeps
   one.
4. **Score.** The pipeline does a geography check and an eligibility check
   on each opportunity. Then it calculates a score. If a check fails, the
   pipeline removes the opportunity. See section 6.
5. **Write.** The pipeline adds each new opportunity to the "Opportunities"
   table. If a record with the same Source ID is already in the table, the
   pipeline does not change it.
6. **Mark as read.** The pipeline marks the email as read. It does this only
   after the parse and the write are successful.

If a step fails, the email stays unread. The next run tries the email again.

---

## 5. Setup

Do these procedures one time. You need administrator access to the GitHub
repository and to the Airtable base.

### 5.1 Make an Airtable token

1. Go to <https://airtable.com/create/tokens>.
2. Click **Create token**.
3. Type a name, for example `charity-aid-pro pipeline`.
4. Add the scope `data.records:read`.
5. Add the scope `data.records:write`.
6. In **Access**, add the base **Music4Wellbeing**.
7. Click **Create token**.
8. Copy the token. Airtable shows the token one time only.

> **WARNING:** The token gives write access to the base. Do not put it in the
> code or in a commit. Keep it only in GitHub secrets or in your local
> environment.

### 5.2 Set the GitHub secrets

1. In GitHub, open the repository.
2. Go to **Settings → Secrets and variables → Actions**.
3. Make sure that these secrets are set:

| Secret | Value |
|---|---|
| `AIRTABLE_TOKEN` | The token from procedure 5.1 |
| `LLM_API_KEY` | Groq API key (starts with `gsk_`) |
| `MSAL_TOKEN_CACHE_B64` | The Outlook login cache. See procedure 5.3. |

4. Optional: set these variables only if you must change the default values.

| Variable | Default value |
|---|---|
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | `openai/gpt-oss-120b` |
| `LLM_REASONING_EFFORT` | `low` |
| `LLM_STRICT_SCHEMA` | `true` |
| `MSAL_CLIENT_ID` | The registered Microsoft Entra app ID |
| `AIRTABLE_BASE_ID` | `apptkzNqMPnlzdyhA` (Music4Wellbeing) |
| `AIRTABLE_OPPORTUNITIES_TABLE` | `tbla8L8gUX6xN1XeO` (Opportunities) |

### 5.3 Log in to the Outlook mailbox

Do this procedure for the first setup. Do it again if the login expires.

1. Install Python 3.11 or later.
2. Install the dependencies:

   ```sh
   pip install -r email_parsing/requirements.txt
   ```

3. From the repository root, start the login:

   ```sh
   python -m email_parsing.outlook auth
   ```

4. Open the link that the command shows. Type the code.
5. Log in with the funding mailbox account.
6. Export the login cache:

   ```sh
   python -m email_parsing.outlook export-cache
   ```

7. Copy the output into the GitHub secret `MSAL_TOKEN_CACHE_B64`.

> **NOTE:** The login cache file is `token_cache.bin` in the repository root.
> Git ignores this file. Do not commit it.

---

## 6. Score

The pipeline does these checks on each opportunity:

1. **Geography check.** The LLM checks that the funder accepts applications
   from Kent. If the location is clear (for example "UK" or "England"), the
   pipeline does not use the LLM. If the LLM call fails, a keyword list does
   the check. If the check fails, the pipeline removes the opportunity.
2. **Eligibility check and score.** The LLM gives two scores from 0 to 100:
   - **Activity score:** how well the activity agrees with group therapeutic
     music sessions.
   - **Audience score:** how well the audience agrees with people in need
     because of ill health, disability or age.

   Score = 40% activity score + 60% audience score. The audience has more
   weight because the wrong beneficiaries is a larger mismatch than the
   wrong activity.

   If the score is less than 20, or the LLM finds that M4W cannot apply (for
   example, the fund is only for individuals), the pipeline removes the
   opportunity. If the LLM call fails, a keyword list calculates the score.

The pipeline writes each removed opportunity and its reason in the workflow
log, with the text `dismissed (not stored)`. Examine these lines to find
opportunities that the pipeline removed incorrectly.

The score ranges (the rubric) are in `email_parsing/prompts/score.txt`. To
change the rubric, see [HOW_TO_MAKE_CHANGES.md](HOW_TO_MAKE_CHANGES.md).

---

## 7. Run the pipeline

### 7.1 Automatic run

The workflow `.github/workflows/email-pipeline.yml` runs each day at
09:17 UTC (09:17 GMT, 10:17 BST). It fetches a maximum of 25 unread emails.
It marks each processed email as read. It keeps the full result
(`parsed.json`) as a workflow artifact for 14 days. `parsed.json` also
contains the removed opportunities (`dismissed`).

> **NOTE:** GitHub can start a scheduled run some hours late when it is busy.
> GitHub also stops the schedule of a public repository after 60 days with
> no commits. This stopped the pipeline from 17 August to 4 November 2026.
> Now each scheduled run enables the workflow again, and this resets the
> 60-day count.

### 7.2 Manual run in GitHub

1. In GitHub, go to **Actions → Email parsing pipeline**.
2. Click **Run workflow**.
3. Optional: change the inputs:
   - `count`: the number of emails to fetch.
   - `unread_only`: fetch only unread emails.
   - `mark_read`: mark the processed emails as read.
4. Click **Run workflow**.

### 7.3 Local run

1. Do procedure 5.3, steps 1 to 5.
2. Set the environment variables:

   ```sh
   export LLM_API_KEY=<Groq key>
   export AIRTABLE_TOKEN=<Airtable token>
   ```

3. Run the pipeline:

   ```sh
   python -m email_parsing.run --count 10
   ```

To test without a write to Airtable, use `--no-store`:

```sh
python -m email_parsing.run --count 5 --no-store --output /tmp/parsed.json
```

The command-line options are:

| Option | Function |
|---|---|
| `--count N` | Fetch the N most recent emails (default 10) |
| `--unread-only` | Fetch only unread emails |
| `--mark-read` | Mark each processed email as read |
| `--no-store` | Do not write to Airtable |
| `--no-score` | Do not calculate scores |
| `--output PATH` | Write the full result as JSON to PATH |

> **NOTE:** A local run does not use `--unread-only` or `--mark-read` by
> default. Thus a local test does not change the mailbox.

### 7.4 Run the tests

```sh
pip install -r email_parsing/requirements.txt pytest
pytest email_parsing/tests
```

The tests do not connect to Outlook, to the LLM or to Airtable.

---

## 8. Configuration

The pipeline reads these environment variables ([config.py](email_parsing/config.py)):

| Variable | Necessary | Default value | Function |
|---|---|---|---|
| `LLM_API_KEY` | Yes | — | API key for the LLM provider |
| `LLM_BASE_URL` | No | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | No | `openai/gpt-oss-120b` | LLM model name |
| `LLM_REASONING_EFFORT` | No | `low` | Reasoning effort for reasoning models. Set `off` for a model that does not reason. |
| `LLM_STRICT_SCHEMA` | No | `true` | `true`: the LLM must give JSON that agrees with the schema. Set `false` for a model that does not support structured outputs. |
| `LLM_TIMEOUT_SECONDS` | No | `60` | Time limit for one LLM call |
| `AIRTABLE_TOKEN` | Yes, for the write | — | Airtable personal access token |
| `AIRTABLE_BASE_ID` | No | `apptkzNqMPnlzdyhA` | Airtable base ID |
| `AIRTABLE_OPPORTUNITIES_TABLE` | No | `tbla8L8gUX6xN1XeO` | "Opportunities" table ID |
| `MSAL_CLIENT_ID` | No | The registered Entra app ID | Change only if you register a new app |
| `MSAL_CACHE_FILE` | No | `<repo>/token_cache.bin` | Local Outlook login cache |
| `MSAL_TOKEN_CACHE_B64` | Yes, in GitHub | — | Base64 Outlook login cache. It overrides the file. |

The pipeline uses table IDs, not table names. Thus you can rename the
tables in Airtable. You cannot rename the fields (see section 3).

---

## 9. LLM model and prompts

### 9.1 Model

The pipeline uses the model `openai/gpt-oss-120b` on the Groq free plan.
Groq stopped `llama-3.3-70b-versatile` for free accounts on 16 August 2026
([Groq deprecations](https://console.groq.com/docs/deprecations)).

The free plan has limits for each model. For `openai/gpt-oss-120b`, the
limits are 8,000 tokens each minute and 200,000 tokens each day
([Groq rate limits](https://console.groq.com/docs/rate-limits)). A test on
18 October 2026 used approximately 6,500 tokens for each email. Thus the
pipeline can process approximately 30 emails each day.

- If the pipeline goes above the limit for each minute, it waits and tries
  again.
- If the pipeline goes above the limit for each day, it stops. The emails
  that it did not process stay unread. The next run processes them.
- If there are many unread emails, the pipeline needs some days to process
  all of them. To make it faster, you can set the variable `LLM_MODEL` to
  `openai/gpt-oss-20b` for some days. That model has a separate limit.

If you change the model, make sure that the model supports structured
outputs ([Groq structured outputs](https://console.groq.com/docs/structured-outputs)).
If it does not, set `LLM_STRICT_SCHEMA` to `false`.

### 9.2 Prompts

The prompts are in `email_parsing/prompts/`:

| File | Function |
|---|---|
| `profile.txt` | The description of Music4Wellbeing. The other prompts use it. |
| `parse.txt` | Finds the opportunities in an email and fills in the fields |
| `geography.txt` | Checks if a charity in Kent can apply |
| `score.txt` | Gives the activity score and the audience score |

To change a prompt:

1. Edit the file. Use short sentences and one instruction in each sentence.
2. Commit and push the change.

Each prompt is the system message. The email or the opportunity is the user
message. The JSON schemas are in `llm.py` and `scoring.py`. If you add or
remove an output field, change the schema and the prompt together.

If an opportunity has incorrect data, the pipeline ignores that opportunity
and writes a warning in the log.

---

## 10. Troubleshooting

| Problem | Possible cause | Action |
|---|---|---|
| The workflow log shows `Missing required env vars ... AIRTABLE_TOKEN` | The secret is not set | Do procedure 5.2. |
| The log shows `Airtable POST ... failed (401)` or `(403)` | The token is incorrect, expired, or has no access to the base | Do procedure 5.1 again. Then update the secret. |
| The log shows `Airtable POST ... failed (422)` | A field name or a field type in Airtable changed | Make the field names and types the same as section 3. |
| The log shows `No cached MSAL account` or `Cached MSAL token expired` | The Outlook login expired | Do procedure 5.3 again. |
| No new records in Airtable | No unread emails, or the LLM found no relevant opportunities | Look at the workflow log. Each email has a line with the classification and the number of opportunities. |
| The same email is processed each day | The write to Airtable fails, so the email stays unread | Look at the workflow log for the error. |
| The log shows `Daily LLM token limit reached — stopping` | The Groq free plan limit for each day is used | Do nothing. The next run processes the unread emails. See section 9.1. |
| The log shows `LLM call failed` with `400` | The model is stopped, or it does not support structured outputs | Make sure that the model is in the [Groq model list](https://console.groq.com/docs/models). See section 9.1. |
| The workflow does not run each day | GitHub stopped the schedule (60 days with no commits), or GitHub is late | Go to **Actions → Email parsing pipeline**. If you see **Enable workflow**, click it. A run that starts some hours late is normal. |
| A contact is the newsletter publisher | The LLM used the newsletter address | Add the email domain to `NOT_FUNDER_CONTACT_DOMAINS` in `email_parsing/llm.py`. |

---

## 11. Retired parts of the old system

The old system had a website, a reminders pipeline and a Supabase database.
This repository no longer contains them. Git history keeps the old code.

Do these steps to finish the shutdown:

1. Unpublish the old website. In GitHub, go to **Settings → Pages**. Click
   **Unpublish site**.
2. Remove the old GitHub secrets `SUPABASE_URL` and `SUPABASE_KEY`.
3. When you no longer need the old data, pause or delete the Supabase
   project. The data in Supabase did not change during the migration.

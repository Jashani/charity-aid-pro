# How to make changes

This guide is for the Music4Wellbeing team. It tells you how to change the
email pipeline without programming knowledge. You use Claude Code to make
the change.

This document uses ASD-STE100 (Simplified Technical English).

---

## 1. What you need

- A Claude subscription that includes Claude Code (the Pro plan is
  sufficient).
- A GitHub account with access to this repository
  (`Jashani/charity-aid-pro`). Ask Yasha to add you as a collaborator.

## 2. Procedure

1. Go to [claude.ai/code](https://claude.ai/code).
2. If Claude asks, connect your GitHub account.
3. Select the repository `Jashani/charity-aid-pro`.
4. Write your request in plain English. Examples:
   - "Update the score rubric: grants for visual arts only should get an
     activity score below 20."
   - "Add the email domain example-newsletter.org to the list of newsletter
     publishers, so that it is not used as a contact."
   - "Change the time of the daily run to 07:30 UK time."
5. Read the answer from Claude. Claude tells you which files it changed.
6. Ask Claude to open a pull request.
7. Ask Yasha to examine the pull request, or merge it yourself.

The change starts at the next daily run after the merge.

## 3. What you can change, and where

| You want to change | File |
|---|---|
| The description of M4W that the LLM uses | `email_parsing/prompts/profile.txt` |
| Which opportunities the LLM removes, and how it fills in the fields (for example Funding Type, amounts, contacts) | `email_parsing/prompts/parse.txt` |
| The activity score and audience score rubric | `email_parsing/prompts/score.txt` |
| The weights of the score (40% activity, 60% audience) and the minimum score (20) | `email_parsing/scoring.py` |
| The geography rule (Kent) | `email_parsing/prompts/geography.txt` |
| The newsletter domains that are not funder contacts | `email_parsing/llm.py` (`NOT_FUNDER_CONTACT_DOMAINS`) |
| The time of the daily run | `.github/workflows/email-pipeline.yml` |

## 4. Rules

- Do not rename or delete fields in the Airtable "Opportunities" table that
  the pipeline writes to. The list is in the [README](README.md), section 3.
  If you must rename a field, ask Claude to change the pipeline at the same
  time.
- You can add new fields in Airtable. The pipeline ignores them.
- After a change, look at the next run in GitHub: **Actions → Email parsing
  pipeline**. A green tick shows a successful run.

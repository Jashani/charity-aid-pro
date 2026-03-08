
# Music for Wellbeing — Funding Dashboard Prototype

## Overview
A clean, intuitive dashboard that helps the charity discover, manage, and track funding opportunities. Built with mock data to demonstrate the full workflow.

## Pages & Features

### 1. Dashboard Home
- **At-a-glance cards**: Total active funding, upcoming deadlines, new opportunities found, expiring soon alerts
- **Urgent alerts banner**: Deadlines within 7 days, eligibility re-applications, expiring funds
- **Quick actions**: Add opportunity, view reports, browse new opportunities

### 2. Opportunity Discovery (Auto-Find)
- Simulated feed of automatically discovered funding opportunities from grant databases, newsletters, and websites
- Each opportunity card shows: funder name, amount, deadline, type (grant/trust/lottery), multi-year badge, relationship status (new vs. previously applied)
- **Smart ranking**: Opportunities ranked by a score based on amount, alignment, relationship history, and timeline
- **Highlighted tags**: "Multi-Year", "Quick Win", "Previously Applied", "Capital Cost", "Re-eligible"
- **Filters**: Amount range, funding type, location, duration (single vs. multi-year), new vs. existing funder, deadline range

### 3. Opportunity Pipeline (Kanban-style)
- Columns: **Identified** → **Researching** → **Applying** → **Submitted** → **Awarded** / **Rejected**
- Drag-and-drop cards between stages
- Track rejection feedback for future reference
- Notes field for each opportunity (eligibility criteria, key contacts, alignment notes)

### 4. Active Funding Tracker
- Table/list of all current active funding with: funder, amount, start date, end date, remaining time (progress bar), renewal eligibility
- **Filters**: By funder, amount, time remaining, funding type
- **Total funding summary** at the top with breakdown charts
- Visual warning indicators for funds expiring within 3 months

### 5. Reports & Insights
- **Quarterly report generator**: Select a quarter, generates a summary with total funding, new applications, success rate, upcoming renewals
- Key metrics for board presentations: funding by source, success rates, pipeline health
- Export-friendly layout (print/PDF ready)

### 6. Email & Reminders (Simulated)
- Settings page showing configured reminder rules:
  - Deadline reminders (7 days, 3 days, 1 day before)
  - Renewal reminders (3 months before funding expires)
  - Re-eligibility notifications (when cooldown periods end)
  - Weekly opportunity digest summary
- Preview of what email notifications would look like

### 7. Funder Relationships
- Contact directory of key funders and organisations
- Relationship history: past applications, outcomes, notes
- Prioritizes returning to known funders in the discovery ranking

## Design Approach
- **Simple sidebar navigation** with clear icons and labels (non-technical users)
- **Warm, approachable color scheme** (blues/greens, charity-friendly)
- **Large cards and clear typography** — no clutter
- **Contextual tooltips** explaining features on first use
- All mock data realistic to a UK music charity context

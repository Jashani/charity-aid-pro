import * as XLSX from 'xlsx';
import type { FundingOpportunity } from './mock-data';

const STATUS_LABELS: Record<string, string> = {
  identified: 'Identified',
  researching: 'Researching',
  applying: 'Applying',
  submitted: 'Submitted',
  awarded: 'Awarded',
  rejected: 'Rejected',
  dismissed: 'Dismissed',
  on_hold: 'On Hold',
  funds_received: 'Funds Received',
};

// M4W financial year runs February–January.
// e.g. any date in Feb 2024–Jan 2025 → "2024-2025"
function deriveFinancialYear(dateStr: string | undefined): string {
  if (!dateStr || dateStr === 'unknown') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 2 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function exportGrantsXlsx(opportunities: FundingOpportunity[]): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Applications ─────────────────────────────────────────────────
  const appHeaders = [
    'Grant Name',
    'Funder',
    'Status',
    'Financial Year',
    'Submission Deadline',
    'Submission Date',
    'Expected Results Date',
    'Date Funding Received',
    'Length of Funding (months)',
    'Tranches',
    'Amount Applied For (£)',
    'Amount Awarded (£)',
    'Funding Gap (£)',
    'Purpose',
    'Description',
    'Feedback',
    'Notes',
    'Link',
  ];

  const appRows = opportunities.map((o) => {
    const fy =
      o.financialYear ??
      deriveFinancialYear(o.submissionDate ?? o.deadline);
    const gap =
      o.amountAwarded != null ? o.amount - o.amountAwarded : null;

    return [
      o.programName,
      o.funderName,
      STATUS_LABELS[o.status] ?? o.status,
      fy,
      o.deadline !== 'unknown' ? o.deadline : '',
      o.submissionDate ?? '',
      o.expectedResultsDate ?? '',
      o.dateFundingReceived ?? '',
      o.durationMonths,
      o.tranches ?? '',
      o.amount || '',
      o.amountAwarded ?? '',
      gap ?? '',
      o.purpose ?? '',
      o.description,
      o.feedback ?? '',
      o.notes,
      o.website,
    ];
  });

  const appWs = XLSX.utils.aoa_to_sheet([appHeaders, ...appRows]);
  appWs['!cols'] = [
    { wch: 42 }, // Grant Name
    { wch: 26 }, // Funder
    { wch: 15 }, // Status
    { wch: 13 }, // Financial Year
    { wch: 20 }, // Submission Deadline
    { wch: 17 }, // Submission Date
    { wch: 22 }, // Expected Results Date
    { wch: 24 }, // Date Funding Received
    { wch: 26 }, // Length of Funding
    { wch: 10 }, // Tranches
    { wch: 22 }, // Amount Applied For
    { wch: 20 }, // Amount Awarded
    { wch: 16 }, // Funding Gap
    { wch: 26 }, // Purpose
    { wch: 55 }, // Description
    { wch: 38 }, // Feedback
    { wch: 38 }, // Notes
    { wch: 45 }, // Link
  ];
  XLSX.utils.book_append_sheet(wb, appWs, 'Applications');

  // ── Sheet 2: Funding Over Time ────────────────────────────────────────────
  // Group by financial year — sums all records where FY can be determined.
  const fyMap = new Map<string, { applied: number; awarded: number }>();
  for (const o of opportunities) {
    const fy =
      o.financialYear ??
      deriveFinancialYear(o.submissionDate ?? o.deadline);
    if (!fy) continue;
    const prev = fyMap.get(fy) ?? { applied: 0, awarded: 0 };
    fyMap.set(fy, {
      applied: prev.applied + (o.amount ?? 0),
      awarded: prev.awarded + (o.amountAwarded ?? 0),
    });
  }

  const fotHeaders = [
    'Financial Year',
    'Amount Applied For (£)',
    'Amount Awarded (£)',
  ];
  const fotRows = [...fyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fy, { applied, awarded }]) => [fy, applied, awarded]);

  const fotWs = XLSX.utils.aoa_to_sheet([fotHeaders, ...fotRows]);
  fotWs['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, fotWs, 'Funding Over Time');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `M4W_grants_${date}.xlsx`);
}

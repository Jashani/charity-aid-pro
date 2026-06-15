import { useMemo } from 'react';
import { useOpportunities } from './useOpportunities';
import { useFunderContacts } from './useFunderContacts';
import type { FundingOpportunity, FunderContact } from '@/lib/mock-data';

export interface FunderRecord {
  normalizedName: string;
  displayName: string;
  opportunities: FundingOpportunity[];
  totalApplications: number;
  awardedCount: number;
  totalAwarded: number;
  lastActivityDate: string;
  contact?: FunderContact;
}

const AWARDED_STATUSES = new Set<string>(['awarded', 'funds_received']);

// Only include a funder on the Relationships page if at least one
// opportunity moved beyond initial identification / dismissal.
const PASSIVE_STATUSES = new Set<string>(['identified', 'dismissed']);

export function normalizeFunderName(name: string): string {
  return name.toLowerCase().trim();
}

export function useFunderHistory() {
  const { data: opportunities = [], isLoading: oppsLoading } = useOpportunities();
  const { data: contacts = [], isLoading: contactsLoading } = useFunderContacts();

  const data = useMemo((): FunderRecord[] => {
    const groups = new Map<string, FundingOpportunity[]>();
    for (const opp of opportunities) {
      const key = normalizeFunderName(opp.funderName);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(opp);
    }

    const contactMap = new Map<string, FunderContact>();
    for (const c of contacts) {
      contactMap.set(normalizeFunderName(c.organisation), c);
    }

    const records: FunderRecord[] = [];

    for (const [normalizedName, opps] of groups) {
      // Skip funders where every opportunity is still at identified/dismissed
      if (opps.every((o) => PASSIVE_STATUSES.has(o.status))) continue;
      const sorted = [...opps].sort((a, b) => {
        const da = a.deadline && a.deadline !== 'unknown' ? new Date(a.deadline).getTime() : 0;
        const db = b.deadline && b.deadline !== 'unknown' ? new Date(b.deadline).getTime() : 0;
        return db - da;
      });

      const awardedOpps = opps.filter((o) => AWARDED_STATUSES.has(o.status));
      const totalAwarded = awardedOpps.reduce(
        (sum, o) => sum + (o.amountAwarded ?? o.amount),
        0,
      );

      records.push({
        normalizedName,
        displayName: sorted[0]?.funderName ?? normalizedName,
        opportunities: sorted,
        totalApplications: opps.length,
        awardedCount: awardedOpps.length,
        totalAwarded,
        lastActivityDate: sorted[0]?.deadline ?? '',
        contact: contactMap.get(normalizedName),
      });
    }

    return records;
  }, [opportunities, contacts]);

  return { data, isLoading: oppsLoading || contactsLoading };
}

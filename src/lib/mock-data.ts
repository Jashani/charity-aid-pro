export type FundingType = 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
export type OpportunityStatus = 'identified' | 'researching' | 'applying' | 'submitted' | 'awarded' | 'rejected' | 'dismissed';

import type { GatingResult, ScoringBreakdown } from './database.types';

export interface FundingOpportunity {
  id: string;
  funderName: string;
  programName: string;
  amount: number;
  amountMax?: number;
  type: FundingType;
  deadline: string;
  location: string;
  durationMonths: number;
  status: OpportunityStatus;
  score: number;
  tags: string[];
  description: string;
  notes: string;
  website: string;
  contactName?: string;
  contactEmail?: string;
  expirationDate?: string;
  amountAwarded?: number;
  dismissalReason?: string;
  reapplicationDate?: string;
  gating?: GatingResult | null;
  scores?: ScoringBreakdown | null;
  scored_at?: string;
}

export interface ActiveFunding {
  id: string;
  funderName: string;
  programName: string;
  amount: number;
  startDate: string;
  endDate: string;
  type: FundingType;
  renewalEligible: boolean;
  notes: string;
}

export interface FunderContact {
  id: string;
  name: string;
  organisation: string;
  email: string;
  phone?: string;
  role: string;
  relationshipScore: number;
  totalFunded: number;
  applicationsCount: number;
  successRate: number;
  lastContact: string;
  notes: string;
}

export interface ReminderRule {
  id: string;
  type: 'deadline' | 'renewal' | 're-eligibility' | 'digest';
  name: string;
  description: string;
  timing: string;
  enabled: boolean;
  lastSent?: string;
}

// --- Helper functions ---
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getFundingProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = new Date().getTime();
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export function getTypeColor(type: FundingType): string {
  switch (type) {
    case 'grant': return 'bg-primary/10 text-primary';
    case 'trust': return 'bg-secondary/10 text-secondary';
    case 'lottery': return 'bg-accent/20 text-accent-foreground';
    case 'corporate': return 'bg-muted text-muted-foreground';
    case 'government': return 'bg-primary/20 text-primary';
  }
}

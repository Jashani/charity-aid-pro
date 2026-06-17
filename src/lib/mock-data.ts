export type FundingType = 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
export type OpportunityStatus = 'identified' | 'on_hold' | 'researching' | 'applying' | 'part_submitted' | 'submitted' | 'awarded' | 'funds_received' | 'rejected' | 'dismissed';

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
  submissionDate?: string;
  expectedResultsDate?: string;
  dateFundingReceived?: string;
  tranches?: number;
  purpose?: string;
  feedback?: string;
  financialYear?: string;
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
  dateFundingReceived?: string;
  tranches?: number;
  purpose?: string;
  financialYear?: string;
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
  type: string;
  name: string;
  description: string;
  cadence: 'before_deadline';
  offsetsDays: number[];
  enabled: boolean;
  lastSent?: string;
}

export interface ReminderRecipient {
  id: string;
  email: string;
  label: string;
  enabled: boolean;
}

// --- Helper functions ---
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

export function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return 0;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
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

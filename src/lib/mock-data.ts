export type FundingType = 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
export type OpportunityStatus = 'identified' | 'researching' | 'applying' | 'submitted' | 'awarded' | 'rejected';
export type RelationshipStatus = 'new' | 'previously-applied' | 'existing-funder' | 're-eligible';

export interface FundingOpportunity {
  id: string;
  funderName: string;
  programName: string;
  amount: number;
  amountMax?: number;
  type: FundingType;
  deadline: string;
  location: string;
  duration: 'single-year' | 'multi-year';
  durationMonths: number;
  relationship: RelationshipStatus;
  status: OpportunityStatus;
  score: number;
  tags: string[];
  description: string;
  eligibility: string;
  notes: string;
  website: string;
  contactName?: string;
  contactEmail?: string;
  rejectionFeedback?: string;
  lastApplied?: string;
  source: string;
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

// --- Mock Opportunities ---
export const mockOpportunities: FundingOpportunity[] = [
  {
    id: '1',
    funderName: 'Arts Council England',
    programName: 'National Lottery Project Grants',
    amount: 15000,
    amountMax: 100000,
    type: 'lottery',
    deadline: '2026-04-15',
    location: 'England',
    duration: 'single-year',
    durationMonths: 12,
    relationship: 'existing-funder',
    status: 'identified',
    score: 95,
    tags: ['Quick Win', 'Previously Applied'],
    description: 'Funding for arts and music projects that engage communities and improve wellbeing.',
    eligibility: 'Not-for-profit organisations delivering arts activities in England.',
    notes: 'We received £12,000 from them last year. Strong alignment with our mission.',
    website: 'https://www.artscouncil.org.uk',
    contactName: 'Sarah Mitchell',
    contactEmail: 'grants@artscouncil.org.uk',
    lastApplied: '2025-03-01',
    source: 'Arts Council Website',
  },
  {
    id: '2',
    funderName: 'National Lottery Community Fund',
    programName: 'Reaching Communities',
    amount: 50000,
    amountMax: 300000,
    type: 'lottery',
    deadline: '2026-05-30',
    location: 'England',
    duration: 'multi-year',
    durationMonths: 36,
    relationship: 'previously-applied',
    status: 'researching',
    score: 88,
    tags: ['Multi-Year', 'Previously Applied'],
    description: 'Large-scale funding for projects that bring people together and build stronger communities.',
    eligibility: 'Voluntary and community organisations with income under £1m.',
    notes: 'Applied in 2024 - rejected due to insufficient evidence of community need. Need stronger data this time.',
    website: 'https://www.tnlcommunityfund.org.uk',
    contactName: 'James Patterson',
    contactEmail: 'funding@tnlcf.org.uk',
    rejectionFeedback: 'Need stronger evidence of community need and measurable outcomes.',
    lastApplied: '2024-09-15',
    source: 'TNLCF Newsletter',
  },
  {
    id: '3',
    funderName: 'Youth Music',
    programName: 'Incubator Fund',
    amount: 2000,
    amountMax: 30000,
    type: 'trust',
    deadline: '2026-03-28',
    location: 'UK-wide',
    duration: 'single-year',
    durationMonths: 12,
    relationship: 'existing-funder',
    status: 'applying',
    score: 92,
    tags: ['Quick Win', 'Previously Applied'],
    description: 'Supporting organisations to use music to improve the lives of children and young people.',
    eligibility: 'UK organisations working with children and young people facing barriers.',
    notes: 'Great fit. We have strong track record with Youth Music.',
    website: 'https://www.youthmusic.org.uk',
    contactName: 'Emily Chen',
    contactEmail: 'grants@youthmusic.org.uk',
    lastApplied: '2025-01-10',
    source: 'Youth Music Newsletter',
  },
  {
    id: '4',
    funderName: 'Garfield Weston Foundation',
    programName: 'Regular Grants',
    amount: 10000,
    amountMax: 100000,
    type: 'trust',
    deadline: '2026-06-30',
    location: 'UK-wide',
    duration: 'single-year',
    durationMonths: 12,
    relationship: 'new',
    status: 'identified',
    score: 75,
    tags: ['Capital Cost'],
    description: 'Supports a wide range of charitable activity across the UK including arts and education.',
    eligibility: 'UK registered charities. Prefers organisations with income under £10m.',
    notes: 'New funder - worth exploring. They fund arts and wellbeing projects.',
    website: 'https://garfieldweston.org',
    source: 'Grant Database',
  },
  {
    id: '5',
    funderName: 'BBC Children in Need',
    programName: 'Main Grants',
    amount: 30000,
    amountMax: 120000,
    type: 'trust',
    deadline: '2026-04-01',
    location: 'UK-wide',
    duration: 'multi-year',
    durationMonths: 36,
    relationship: 're-eligible',
    status: 'identified',
    score: 85,
    tags: ['Multi-Year', 'Re-eligible'],
    description: 'Funding for projects working with disadvantaged children and young people across the UK.',
    eligibility: 'Not-for-profit organisations working with children/young people up to 18.',
    notes: 'Previously funded 2022-2024. Now eligible to reapply. Strong relationship.',
    website: 'https://www.bbcchildreninneed.co.uk',
    contactName: 'David Roberts',
    contactEmail: 'pudsey@bbc.co.uk',
    lastApplied: '2022-06-01',
    source: 'BBC CiN Website',
  },
  {
    id: '6',
    funderName: 'PRS Foundation',
    programName: 'Open Fund for Music Creators',
    amount: 5000,
    amountMax: 10000,
    type: 'trust',
    deadline: '2026-05-15',
    location: 'UK-wide',
    duration: 'single-year',
    durationMonths: 6,
    relationship: 'new',
    status: 'identified',
    score: 70,
    tags: ['Quick Win'],
    description: 'Supporting new music being created and reaching audiences across the UK.',
    eligibility: 'UK-based organisations or individuals creating new music.',
    notes: 'Smaller fund but very aligned with music mission.',
    website: 'https://prsfoundation.com',
    source: 'Music Sector Newsletter',
  },
  {
    id: '7',
    funderName: 'Esmée Fairbairn Foundation',
    programName: 'Arts Programme',
    amount: 20000,
    amountMax: 200000,
    type: 'trust',
    deadline: '2026-07-31',
    location: 'UK-wide',
    duration: 'multi-year',
    durationMonths: 36,
    relationship: 'new',
    status: 'identified',
    score: 72,
    tags: ['Multi-Year'],
    description: 'One of the largest independent funders in the UK supporting arts that are excellent, ambitious, and engaging.',
    eligibility: 'UK registered charities working in arts and culture.',
    notes: 'Large potential but competitive. Need strong application.',
    website: 'https://esmeefairbairn.org.uk',
    source: 'Grant Database',
  },
  {
    id: '8',
    funderName: 'John Lyon\'s Charity',
    programName: 'Main Grants Programme',
    amount: 5000,
    amountMax: 50000,
    type: 'trust',
    deadline: '2026-04-30',
    location: 'North & West London',
    duration: 'single-year',
    durationMonths: 12,
    relationship: 'existing-funder',
    status: 'submitted',
    score: 90,
    tags: ['Previously Applied'],
    description: 'Supporting children and young people in North and West London boroughs.',
    eligibility: 'Organisations working with young people in specified London boroughs.',
    notes: 'Application submitted 2 weeks ago. Awaiting decision.',
    website: 'https://www.jlc.london',
    contactName: 'Anna Whitfield',
    contactEmail: 'grants@jlc.london',
    lastApplied: '2026-02-20',
    source: 'Direct Contact',
  },
  {
    id: '9',
    funderName: 'Help Musicians',
    programName: 'Creative Programme',
    amount: 1000,
    amountMax: 15000,
    type: 'trust',
    deadline: '2026-06-15',
    location: 'UK-wide',
    duration: 'single-year',
    durationMonths: 12,
    relationship: 'previously-applied',
    status: 'identified',
    score: 78,
    tags: ['Quick Win'],
    description: 'Supporting musicians and music organisations to create, perform, and sustain careers.',
    eligibility: 'Musicians and music organisations based in the UK.',
    notes: 'Applied before for a different programme. Good relationship.',
    website: 'https://www.helpmusicians.org.uk',
    lastApplied: '2024-11-01',
    source: 'Help Musicians Newsletter',
  },
  {
    id: '10',
    funderName: 'City of London Corporation',
    programName: 'Central Grants Programme',
    amount: 10000,
    amountMax: 60000,
    type: 'government',
    deadline: '2026-05-01',
    location: 'London',
    duration: 'multi-year',
    durationMonths: 24,
    relationship: 'new',
    status: 'identified',
    score: 65,
    tags: ['Multi-Year'],
    description: 'Funding to reduce inequality and increase opportunity across London.',
    eligibility: 'Charities working to reduce disadvantage in London.',
    notes: 'Worth exploring, but may require London-specific delivery evidence.',
    website: 'https://www.cityoflondon.gov.uk',
    source: 'Government Grants Portal',
  },
];

// --- Mock Active Funding ---
export const mockActiveFunding: ActiveFunding[] = [
  {
    id: 'af1',
    funderName: 'Arts Council England',
    programName: 'National Lottery Project Grants',
    amount: 12000,
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    type: 'lottery',
    renewalEligible: true,
    notes: 'Community music workshops in 5 London boroughs. Report due March 2026.',
  },
  {
    id: 'af2',
    funderName: 'Youth Music',
    programName: 'Incubator Fund',
    amount: 8500,
    startDate: '2025-06-01',
    endDate: '2026-05-31',
    type: 'trust',
    renewalEligible: true,
    notes: 'Young people music programme ages 8-16. Mid-term report submitted.',
  },
  {
    id: 'af3',
    funderName: 'John Lyon\'s Charity',
    programName: 'Main Grants Programme',
    amount: 25000,
    startDate: '2025-01-01',
    endDate: '2026-12-31',
    type: 'trust',
    renewalEligible: false,
    notes: 'Two-year programme for music therapy in schools. On track.',
  },
  {
    id: 'af4',
    funderName: 'National Lottery Community Fund',
    programName: 'Awards for All',
    amount: 9800,
    startDate: '2025-09-01',
    endDate: '2026-08-31',
    type: 'lottery',
    renewalEligible: true,
    notes: 'Community choir project. Going well, good attendance figures.',
  },
  {
    id: 'af5',
    funderName: 'BBC Children in Need',
    programName: 'Main Grants',
    amount: 45000,
    startDate: '2024-04-01',
    endDate: '2026-03-31',
    type: 'trust',
    renewalEligible: true,
    notes: 'Multi-year project ending soon. Need to plan renewal application.',
  },
];

// --- Mock Funder Contacts ---
export const mockFunderContacts: FunderContact[] = [
  {
    id: 'fc1',
    name: 'Sarah Mitchell',
    organisation: 'Arts Council England',
    email: 'sarah.mitchell@artscouncil.org.uk',
    phone: '020 7946 0958',
    role: 'Grants Officer',
    relationshipScore: 9,
    totalFunded: 24000,
    applicationsCount: 3,
    successRate: 67,
    lastContact: '2026-01-15',
    notes: 'Very supportive. Always provides detailed feedback. Prefers email contact.',
  },
  {
    id: 'fc2',
    name: 'James Patterson',
    organisation: 'National Lottery Community Fund',
    email: 'james.patterson@tnlcf.org.uk',
    role: 'Funding Officer',
    relationshipScore: 5,
    totalFunded: 0,
    applicationsCount: 1,
    successRate: 0,
    lastContact: '2024-12-01',
    notes: 'Provided useful feedback after rejection. Encouraged us to reapply.',
  },
  {
    id: 'fc3',
    name: 'Emily Chen',
    organisation: 'Youth Music',
    email: 'emily.chen@youthmusic.org.uk',
    phone: '020 7489 8999',
    role: 'Programme Manager',
    relationshipScore: 8,
    totalFunded: 18500,
    applicationsCount: 2,
    successRate: 100,
    lastContact: '2026-02-10',
    notes: 'Excellent relationship. Invited us to networking events. Strong advocate.',
  },
  {
    id: 'fc4',
    name: 'Anna Whitfield',
    organisation: 'John Lyon\'s Charity',
    email: 'anna.whitfield@jlc.london',
    role: 'Grants Manager',
    relationshipScore: 7,
    totalFunded: 25000,
    applicationsCount: 2,
    successRate: 50,
    lastContact: '2026-02-20',
    notes: 'Professional and efficient. Values detailed impact evidence.',
  },
  {
    id: 'fc5',
    name: 'David Roberts',
    organisation: 'BBC Children in Need',
    email: 'david.roberts@bbc.co.uk',
    role: 'Regional Grants Officer',
    relationshipScore: 8,
    totalFunded: 45000,
    applicationsCount: 1,
    successRate: 100,
    lastContact: '2025-11-20',
    notes: 'Very hands-on. Regularly checks in on project progress. Great supporter.',
  },
];

// --- Mock Reminder Rules ---
export const mockReminderRules: ReminderRule[] = [
  {
    id: 'r1',
    type: 'deadline',
    name: 'Application Deadline (7 days)',
    description: 'Get notified 7 days before an application deadline.',
    timing: '7 days before deadline',
    enabled: true,
    lastSent: '2026-03-01',
  },
  {
    id: 'r2',
    type: 'deadline',
    name: 'Application Deadline (3 days)',
    description: 'Urgent reminder 3 days before deadline.',
    timing: '3 days before deadline',
    enabled: true,
  },
  {
    id: 'r3',
    type: 'deadline',
    name: 'Application Deadline (1 day)',
    description: 'Final reminder the day before deadline.',
    timing: '1 day before deadline',
    enabled: true,
  },
  {
    id: 'r4',
    type: 'renewal',
    name: 'Funding Renewal Reminder',
    description: 'Reminder when current funding is 3 months from expiry.',
    timing: '3 months before funding ends',
    enabled: true,
    lastSent: '2026-02-15',
  },
  {
    id: 'r5',
    type: 're-eligibility',
    name: 'Re-eligibility Notice',
    description: 'Notification when cooldown period ends and you can reapply.',
    timing: 'When cooldown period expires',
    enabled: true,
  },
  {
    id: 'r6',
    type: 'digest',
    name: 'Weekly Opportunity Digest',
    description: 'Weekly summary of new funding opportunities discovered.',
    timing: 'Every Monday at 9:00 AM',
    enabled: true,
    lastSent: '2026-03-03',
  },
];

// --- Helper functions ---
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date('2026-03-08'); // current date
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getFundingProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = new Date('2026-03-08').getTime();
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

export function getRelationshipLabel(status: RelationshipStatus): string {
  switch (status) {
    case 'new': return 'New Funder';
    case 'previously-applied': return 'Previously Applied';
    case 'existing-funder': return 'Existing Funder';
    case 're-eligible': return 'Re-eligible';
  }
}

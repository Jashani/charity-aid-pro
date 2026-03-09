import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { Download, Printer, TrendingUp, TrendingDown, Target, CheckCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  mockActiveFunding,
  formatCurrency,
  daysUntil,
} from "@/lib/mock-data";

const quarters = [
  { value: "q1-2026", label: "Q1 2026 (Jan–Mar)" },
  { value: "q4-2025", label: "Q4 2025 (Oct–Dec)" },
  { value: "q3-2025", label: "Q3 2025 (Jul–Sep)" },
];

/* ── Derived data ── */
const totalActive = mockActiveFunding.reduce((s, f) => s + f.amount, 0);
const expiringSoonValue = mockActiveFunding
  .filter((f) => daysUntil(f.endDate) <= 90 && daysUntil(f.endDate) > 0)
  .reduce((s, f) => s + f.amount, 0);
const securedPercentage = totalActive > 0 ? Math.round(((totalActive - expiringSoonValue) / totalActive) * 100) : 0;

const totalApps = mockOpportunities.length;
const submitted = mockOpportunities.filter((o) => o.status === "submitted").length;
const awarded = mockOpportunities.filter((o) => o.status === "awarded").length;
const rejected = mockOpportunities.filter((o) => o.status === "rejected").length;
const inProgress = mockOpportunities.filter((o) => ["researching", "applying"].includes(o.status)).length;
const successRate = (submitted + awarded + rejected) > 0
  ? Math.round((awarded / (submitted + awarded + rejected)) * 100)
  : 0;

/* ── Chart data ── */
const fundingBySource = [
  { source: "Trust", amount: 78500, fill: "hsl(var(--primary))" },
  { source: "Lottery", amount: 21800, fill: "hsl(var(--accent))" },
];

const applicationProgress = [
  { stage: "Identified", count: mockOpportunities.filter(o => o.status === "identified").length },
  { stage: "In Progress", count: inProgress },
  { stage: "Submitted", count: submitted },
  { stage: "Awarded", count: awarded },
  { stage: "Rejected", count: rejected },
];

const sourceChartConfig: ChartConfig = {
  amount: { label: "Amount" },
  Trust: { label: "Trust", color: "hsl(var(--primary))" },
  Lottery: { label: "Lottery", color: "hsl(var(--accent))" },
};

const progressChartConfig: ChartConfig = {
  count: { label: "Applications", color: "hsl(var(--primary))" },
};

const Reports = () => {
  const [selectedQuarter, setSelectedQuarter] = useState("q1-2026");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports & Insights</h1>
            <p className="text-muted-foreground mt-1">
              Key metrics for board presentations. Select a quarter to view.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* ── Section 1: Money In vs Money Ending ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">💰 Financial Health</h2>
          <p className="text-sm text-muted-foreground mb-4">
            How much funding you have now versus how much is ending soon.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Active Funding
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totalActive)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {mockActiveFunding.length} grants
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ending Within 3 Months
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(expiringSoonValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mockActiveFunding.filter(f => daysUntil(f.endDate) <= 90 && daysUntil(f.endDate) > 0).length} grant(s) expiring
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Secured Funding
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{securedPercentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Of your funding has 3+ months remaining
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Section 2: Application Progress ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">📊 Application Progress</h2>
          <p className="text-sm text-muted-foreground mb-4">
            How your applications are moving through the pipeline.
          </p>
          <div className="grid gap-4 md:grid-cols-4 mb-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Applications</p>
                <p className="text-2xl font-bold mt-1">{totalApps}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold mt-1">{inProgress}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Awaiting Decision</p>
                <p className="text-2xl font-bold mt-1">{submitted}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {successRate}%
                  {successRate > 0 && <span className="text-sm font-normal text-muted-foreground ml-1">({awarded} won)</span>}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applications by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={progressChartConfig} className="h-[220px]">
                <BarChart data={applicationProgress}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Section 3: Funding by Source ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">🏛️ Funding Breakdown by Source</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Where your money comes from — useful for diversification planning.
          </p>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <ChartContainer config={sourceChartConfig} className="h-[220px] w-[280px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={fundingBySource}
                      dataKey="amount"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                    >
                      {fundingBySource.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 space-y-3">
                  {fundingBySource.map((entry) => (
                    <div key={entry.source} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-sm font-medium">{entry.source}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(entry.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round((entry.amount / totalActive) * 100)}% of total
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;

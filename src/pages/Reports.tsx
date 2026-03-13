import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Download, Printer, TrendingUp, TrendingDown, CheckCircle } from "lucide-react";
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
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground mt-1">Key metrics for board presentations.</p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-48 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="rounded-xl">
              <Printer className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-xl">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Financial Health */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Financial Health</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Total Active", value: formatCurrency(totalActive), sub: `${mockActiveFunding.length} grants`, icon: TrendingUp, color: "text-primary" },
              { label: "Ending Soon", value: formatCurrency(expiringSoonValue), sub: `${mockActiveFunding.filter(f => daysUntil(f.endDate) <= 90 && daysUntil(f.endDate) > 0).length} expiring`, icon: TrendingDown, color: "text-destructive" },
              { label: "Secured", value: `${securedPercentage}%`, sub: "3+ months remaining", icon: CheckCircle, color: "text-secondary" },
            ].map((s) => (
              <Card key={s.label} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color === "text-destructive" ? "text-destructive" : ""}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Application Progress */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Application Progress</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Total", value: totalApps },
              { label: "In Progress", value: inProgress },
              { label: "Awaiting Decision", value: submitted },
              { label: "Success Rate", value: `${successRate}%` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>
          <Card className="rounded-xl overflow-hidden">
            <CardContent className="p-5">
              <p className="text-sm font-medium mb-4">Applications by Stage</p>
              <ChartContainer config={progressChartConfig} className="h-[200px]">
                <BarChart data={applicationProgress}>
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        {/* Funding by Source */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Funding by Source</h2>
          <Card className="rounded-xl overflow-hidden">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <ChartContainer config={sourceChartConfig} className="h-[200px] w-[240px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={fundingBySource}
                      dataKey="amount"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      strokeWidth={2}
                    >
                      {fundingBySource.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 space-y-3 w-full">
                  {fundingBySource.map((entry) => (
                    <div key={entry.source} className="flex items-center justify-between rounded-xl border p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                        <span className="text-sm font-medium">{entry.source}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(entry.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round((entry.amount / totalActive) * 100)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default Reports;

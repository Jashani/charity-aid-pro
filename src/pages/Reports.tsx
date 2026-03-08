import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { Download, Printer, TrendingUp, Target, Clock, CheckCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  mockActiveFunding,
  formatCurrency,
} from "@/lib/mock-data";

const quarters = [
  { value: "q1-2026", label: "Q1 2026 (Jan–Mar)" },
  { value: "q4-2025", label: "Q4 2025 (Oct–Dec)" },
  { value: "q3-2025", label: "Q3 2025 (Jul–Sep)" },
  { value: "q2-2025", label: "Q2 2025 (Apr–Jun)" },
];

const fundingBySource = [
  { source: "Trust", amount: 78500, fill: "hsl(var(--primary))" },
  { source: "Lottery", amount: 21800, fill: "hsl(var(--accent))" },
  { source: "Government", amount: 0, fill: "hsl(var(--muted-foreground))" },
];

const pipelineData = [
  { stage: "Identified", count: 6 },
  { stage: "Researching", count: 1 },
  { stage: "Applying", count: 1 },
  { stage: "Submitted", count: 1 },
  { stage: "Awarded", count: 0 },
  { stage: "Rejected", count: 0 },
];

const sourceChartConfig: ChartConfig = {
  amount: { label: "Amount" },
  Trust: { label: "Trust", color: "hsl(var(--primary))" },
  Lottery: { label: "Lottery", color: "hsl(var(--accent))" },
  Government: { label: "Government", color: "hsl(var(--muted-foreground))" },
};

const pipelineChartConfig: ChartConfig = {
  count: { label: "Opportunities", color: "hsl(var(--primary))" },
};

const Reports = () => {
  const [selectedQuarter, setSelectedQuarter] = useState("q1-2026");

  const totalActive = mockActiveFunding.reduce((s, f) => s + f.amount, 0);
  const totalApps = mockOpportunities.length;
  const awarded = mockOpportunities.filter((o) => o.status === "awarded").length;
  const submitted = mockOpportunities.filter((o) => o.status === "submitted").length;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports & Insights</h1>
            <p className="text-muted-foreground mt-1">
              Key metrics and quarterly reports for board presentations.
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

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Funding</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totalActive)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Applications</CardTitle>
              <Target className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalApps}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{submitted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalApps > 0 ? Math.round((awarded / totalApps) * 100) : 0}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Funding by Source</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={sourceChartConfig} className="h-[250px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={fundingBySource.filter((d) => d.amount > 0)}
                    dataKey="amount"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                  >
                    {fundingBySource
                      .filter((d) => d.amount > 0)
                      .map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex justify-center gap-4 mt-2">
                {fundingBySource
                  .filter((d) => d.amount > 0)
                  .map((entry) => (
                    <div key={entry.source} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                      {entry.source}: {formatCurrency(entry.amount)}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pipeline Health</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={pipelineChartConfig} className="h-[250px]">
                <BarChart data={pipelineData}>
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Quarterly Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quarterly Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>This Quarter</TableHead>
                  <TableHead>Last Quarter</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { metric: "Total Active Funding", current: "£100,300", prev: "£87,500", change: "+15%" },
                  { metric: "New Applications", current: "4", prev: "3", change: "+33%" },
                  { metric: "Submitted", current: "1", prev: "2", change: "-50%" },
                  { metric: "Success Rate", current: "0%", prev: "50%", change: "-50%" },
                  { metric: "Upcoming Renewals", current: "2", prev: "1", change: "+100%" },
                ].map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell>{row.current}</TableCell>
                    <TableCell className="text-muted-foreground">{row.prev}</TableCell>
                    <TableCell>
                      <Badge variant={row.change.startsWith("+") ? "default" : "destructive"} className="text-xs">
                        {row.change}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Reports;

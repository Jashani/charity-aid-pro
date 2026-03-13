import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PoundSterling, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockActiveFunding,
  formatCurrency,
  daysUntil,
} from "@/lib/mock-data";

const Funding = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const total = mockActiveFunding.reduce((s, f) => s + f.amount, 0);
  const expiringSoon = mockActiveFunding.filter((f) => daysUntil(f.endDate) <= 90 && daysUntil(f.endDate) > 0);
  const renewableCount = mockActiveFunding.filter((f) => f.renewalEligible).length;

  const filtered = useMemo(() => {
    let result = [...mockActiveFunding];
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      result = result.filter(
        (f) => f.funderName.toLowerCase().includes(t) || f.programName.toLowerCase().includes(t)
      );
    }
    if (typeFilter !== "all") result = result.filter((f) => f.type === typeFilter);
    return result;
  }, [searchTerm, typeFilter]);

  const getRowStyle = (daysLeft: number) => {
    if (daysLeft <= 30) return "bg-destructive/5 border-l-4 border-l-destructive";
    if (daysLeft <= 90) return "bg-warning/5 border-l-4 border-l-warning";
    return "";
  };

  const getTimeLabel = (daysLeft: number) => {
    if (daysLeft <= 0) return { text: "Expired", variant: "destructive" as const };
    if (daysLeft <= 30) return { text: `${daysLeft}d — Urgent`, variant: "destructive" as const };
    if (daysLeft <= 90) return { text: `${daysLeft}d — Expiring`, variant: "secondary" as const };
    const months = Math.round(daysLeft / 30);
    return { text: `${months} months`, variant: "outline" as const };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Funding</h1>
          <p className="text-muted-foreground mt-1">Your current grants. Red rows need urgent attention.</p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Active", value: formatCurrency(total), sub: `${mockActiveFunding.length} grants`, icon: PoundSterling, color: "text-primary" },
            { label: "Expiring Soon", value: expiringSoon.length, sub: "Within 3 months", icon: AlertTriangle, color: "text-destructive" },
            { label: "Renewable", value: renewableCount, sub: "Can be renewed", icon: RefreshCw, color: "text-secondary" },
          ].map((s) => (
            <Card key={s.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search funders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="trust">Trust</SelectItem>
              <SelectItem value="lottery">Lottery</SelectItem>
              <SelectItem value="government">Government</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="overflow-hidden rounded-xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs uppercase tracking-wider">Funder</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Amount</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Period</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Time Left</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((fund) => {
                const remaining = daysUntil(fund.endDate);
                const timeLabel = getTimeLabel(remaining);
                return (
                  <TableRow key={fund.id} className={getRowStyle(remaining)}>
                    <TableCell>
                      <p className="font-medium text-sm">{fund.funderName}</p>
                      <p className="text-xs text-muted-foreground">{fund.programName}</p>
                    </TableCell>
                    <TableCell className="font-semibold text-sm">{formatCurrency(fund.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(fund.startDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                      {" – "}
                      {new Date(fund.endDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={timeLabel.variant} className="text-xs rounded-full">
                        {timeLabel.text}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {fund.renewalEligible ? (
                        <Badge variant="secondary" className="text-xs rounded-full">Renewable</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs rounded-full">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Funding;

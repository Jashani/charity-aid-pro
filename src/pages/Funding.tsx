import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { PoundSterling, Search, AlertTriangle, RefreshCw, CalendarDays } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockActiveFunding,
  formatCurrency,
  daysUntil,
  getFundingProgress,
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

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Funding</h1>
          <p className="text-muted-foreground mt-1">Track your current grants and their timelines.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Active</CardTitle>
              <PoundSterling className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{mockActiveFunding.length} grants</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{expiringSoon.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Within 3 months</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Renewal Eligible</CardTitle>
              <RefreshCw className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{renewableCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Can be renewed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search funders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
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
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funder</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="w-[200px]">Progress</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((fund) => {
                const progress = getFundingProgress(fund.startDate, fund.endDate);
                const remaining = daysUntil(fund.endDate);
                const isExpiring = remaining <= 90 && remaining > 0;
                return (
                  <TableRow key={fund.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{fund.funderName}</p>
                        <p className="text-xs text-muted-foreground">{fund.programName}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency(fund.amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(fund.startDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                        {" – "}
                        {new Date(fund.endDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{remaining} days left</p>
                    </TableCell>
                    <TableCell>
                      <Progress
                        value={progress}
                        className={`h-2 ${isExpiring ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {isExpiring && (
                          <Badge variant="destructive" className="text-xs w-fit">
                            Expiring Soon
                          </Badge>
                        )}
                        {fund.renewalEligible && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            Renewable
                          </Badge>
                        )}
                        {!isExpiring && !fund.renewalEligible && (
                          <Badge variant="outline" className="text-xs w-fit">Active</Badge>
                        )}
                      </div>
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

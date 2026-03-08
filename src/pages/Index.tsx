import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  PoundSterling,
  Clock,
  Search,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  CalendarDays,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  mockActiveFunding,
  formatCurrency,
  daysUntil,
  getFundingProgress,
} from "@/lib/mock-data";

const Index = () => {
  const totalActive = mockActiveFunding.reduce((sum, f) => sum + f.amount, 0);
  const upcomingDeadlines = mockOpportunities.filter(
    (o) => o.status !== "awarded" && o.status !== "rejected" && daysUntil(o.deadline) <= 30 && daysUntil(o.deadline) > 0
  );
  const urgentDeadlines = upcomingDeadlines.filter((o) => daysUntil(o.deadline) <= 7);
  const expiringSoon = mockActiveFunding.filter((f) => {
    const days = daysUntil(f.endDate);
    return days <= 90 && days > 0;
  });
  const newOpportunities = mockOpportunities.filter((o) => o.status === "identified");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back. Here's your funding overview for today.
          </p>
        </div>

        {/* Urgent Alerts */}
        {(urgentDeadlines.length > 0 || expiringSoon.length > 0) && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Attention Needed</p>
                  {urgentDeadlines.map((o) => (
                    <p key={o.id} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{o.funderName}</span> deadline in{" "}
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        {daysUntil(o.deadline)} days
                      </Badge>
                    </p>
                  ))}
                  {expiringSoon.map((f) => (
                    <p key={f.id} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{f.funderName}</span> funding expires in{" "}
                      {daysUntil(f.endDate)} days
                      {f.renewalEligible && (
                        <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                          Renewal eligible
                        </Badge>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Active Funding</CardTitle>
              <PoundSterling className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totalActive)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {mockActiveFunding.length} active grants
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Deadlines</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{upcomingDeadlines.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Within the next 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">New Opportunities</CardTitle>
              <Search className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{newOpportunities.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Discovered this week</p>
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
        </div>

        {/* Quick Actions + Top Opportunities */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/discover">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4" /> Browse New Opportunities
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/pipeline">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> View Pipeline
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/reports">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Generate Report
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/relationships">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Star className="h-4 w-4" /> Funder Relationships
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Top Opportunities */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Top Opportunities</CardTitle>
              <Link to="/discover">
                <Button variant="ghost" size="sm">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockOpportunities
                .filter((o) => o.status === "identified")
                .sort((a, b) => b.score - a.score)
                .slice(0, 4)
                .map((opp) => (
                  <div
                    key={opp.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{opp.funderName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {opp.programName}
                      </p>
                      <div className="flex gap-1 mt-1">
                        {opp.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(opp.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {daysUntil(opp.deadline)}d left
                      </p>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>

        {/* Active Funding Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Active Funding</CardTitle>
            <Link to="/funding">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockActiveFunding.slice(0, 3).map((fund) => {
              const progress = getFundingProgress(fund.startDate, fund.endDate);
              const remaining = daysUntil(fund.endDate);
              return (
                <div key={fund.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{fund.funderName}</p>
                      <p className="text-xs text-muted-foreground">{fund.programName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(fund.amount)}</p>
                      <p className="text-xs text-muted-foreground">{remaining} days remaining</p>
                    </div>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-2 ${remaining <= 90 ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Index;

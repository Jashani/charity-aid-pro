import { Card, CardContent } from "@/components/ui/card";
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
  Sparkles,
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
      <div className="space-y-8 max-w-5xl">
        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Good morning 👋</h1>
          <p className="text-muted-foreground mt-1">Here's your funding overview.</p>
        </div>

        {/* Urgent Alerts */}
        {(urgentDeadlines.length > 0 || expiringSoon.length > 0) && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="font-semibold text-sm">Needs attention</p>
              {urgentDeadlines.map((o) => (
                <p key={o.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{o.funderName}</span> — deadline in{" "}
                  <span className="text-destructive font-semibold">{daysUntil(o.deadline)}d</span>
                </p>
              ))}
              {expiringSoon.map((f) => (
                <p key={f.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{f.funderName}</span> — funding expires in {daysUntil(f.endDate)}d
                  {f.renewalEligible && (
                    <Badge variant="secondary" className="ml-2 text-[10px] py-0">Renewable</Badge>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active Funding", value: formatCurrency(totalActive), sub: `${mockActiveFunding.length} grants`, icon: PoundSterling, color: "text-primary" },
            { label: "Upcoming Deadlines", value: upcomingDeadlines.length, sub: "Next 30 days", icon: Clock, color: "text-warning" },
            { label: "New Opportunities", value: newOpportunities.length, sub: "Discovered this week", icon: Sparkles, color: "text-secondary" },
            { label: "Expiring Soon", value: expiringSoon.length, sub: "Within 3 months", icon: AlertTriangle, color: "text-destructive" },
          ].map((stat) => (
            <Card key={stat.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Quick Links */}
          <div className="lg:col-span-2 space-y-2">
            <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
            {[
              { to: "/discover", label: "Browse Opportunities", icon: Search },
              { to: "/pipeline", label: "View Pipeline", icon: TrendingUp },
              { to: "/funding", label: "Active Funding", icon: PoundSterling },
            ].map((link) => (
              <Link key={link.to} to={link.to}>
                <div className="flex items-center justify-between rounded-xl border p-3.5 hover:bg-muted/50 transition-colors cursor-pointer group">
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <link.icon className="h-4 w-4 text-muted-foreground" />
                    {link.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>

          {/* Top Opportunities */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Top Opportunities</h2>
              <Link to="/discover">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {mockOpportunities
                .filter((o) => o.status === "identified")
                .sort((a, b) => b.score - a.score)
                .slice(0, 4)
                .map((opp) => (
                  <div
                    key={opp.id}
                    className="flex items-center justify-between rounded-xl border p-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{opp.funderName}</p>
                      <p className="text-xs text-muted-foreground truncate">{opp.programName}</p>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(opp.amount)}</p>
                      <p className="text-[11px] text-muted-foreground">{daysUntil(opp.deadline)}d left</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Active Funding Preview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Active Funding</h2>
            <Link to="/funding">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {mockActiveFunding.slice(0, 3).map((fund) => {
              const progress = getFundingProgress(fund.startDate, fund.endDate);
              const remaining = daysUntil(fund.endDate);
              return (
                <div key={fund.id} className="rounded-xl border p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{fund.funderName}</p>
                      <p className="text-xs text-muted-foreground">{fund.programName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(fund.amount)}</p>
                      <p className={`text-xs ${remaining <= 90 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {remaining}d remaining
                      </p>
                    </div>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-1.5 ${remaining <= 90 ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;

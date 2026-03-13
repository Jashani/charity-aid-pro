import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, Clock, RefreshCw, CalendarCheck, Newspaper, Eye } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { mockReminderRules, type ReminderRule } from "@/lib/mock-data";

const typeIcons: Record<string, React.ReactNode> = {
  deadline: <Clock className="h-5 w-5 text-warning" />,
  renewal: <RefreshCw className="h-5 w-5 text-primary" />,
  "re-eligibility": <CalendarCheck className="h-5 w-5 text-secondary" />,
  digest: <Newspaper className="h-5 w-5 text-muted-foreground" />,
};

const Reminders = () => {
  const [rules, setRules] = useState<ReminderRule[]>(mockReminderRules);
  const [showPreview, setShowPreview] = useState(false);

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reminders</h1>
            <p className="text-muted-foreground mt-1">Never miss a deadline.</p>
          </div>
          <Button
            variant={showPreview ? "default" : "outline"}
            className="gap-2 rounded-xl"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-4 w-4" /> {showPreview ? "Hide" : "Preview Email"}
          </Button>
        </div>

        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-4 rounded-xl border p-4 hover:bg-muted/30 transition-colors">
              <div className="shrink-0">{typeIcons[rule.type]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{rule.name}</p>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted rounded-full px-2 py-0.5">{rule.type}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {rule.timing}</span>
                  {rule.lastSent && (
                    <span>Last: {new Date(rule.lastSent).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
              </div>
              <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
            </div>
          ))}
        </div>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email Recipients
            </CardTitle>
            <CardDescription>Where notifications are sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">team@musicforwellbeing.org</p>
                <p className="text-xs text-muted-foreground">Primary</p>
              </div>
              <Badge className="rounded-full">Active</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">director@musicforwellbeing.org</p>
                <p className="text-xs text-muted-foreground">Board updates</p>
              </div>
              <Badge variant="secondary" className="rounded-full">Digest</Badge>
            </div>
            <Button variant="outline" size="sm" className="mt-2 rounded-xl">+ Add recipient</Button>
          </CardContent>
        </Card>

        {showPreview && (
          <Card className="rounded-xl border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Email Preview</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border bg-card p-5 space-y-4 text-sm">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>From:</strong> noreply@musicforwellbeing.org</p>
                  <p><strong>To:</strong> team@musicforwellbeing.org</p>
                  <p><strong>Subject:</strong> ⏰ Deadline: Youth Music — Incubator Fund (20 days)</p>
                </div>
                <hr className="border-border" />
                <div className="space-y-3">
                  <p>Hi team,</p>
                  <p>The <strong>Youth Music — Incubator Fund</strong> deadline is in <strong>20 days</strong> (28 March 2026).</p>
                  <div className="bg-muted/50 rounded-xl p-3 space-y-1 text-xs">
                    <p><strong>Amount:</strong> £2,000 – £30,000</p>
                    <p><strong>Deadline:</strong> 28 March 2026</p>
                    <p><strong>Status:</strong> Applying</p>
                  </div>
                  <p className="text-muted-foreground text-xs">— Music for Wellbeing</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reminders;

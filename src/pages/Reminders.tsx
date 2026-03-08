import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  digest: <Newspaper className="h-5 w-5 text-accent-foreground" />,
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
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reminders & Notifications</h1>
            <p className="text-muted-foreground mt-1">
              Configure automatic email reminders so you never miss a deadline.
            </p>
          </div>
          <Button
            variant={showPreview ? "default" : "outline"}
            className="gap-2"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-4 w-4" /> {showPreview ? "Hide Preview" : "Preview Email"}
          </Button>
        </div>

        {/* Reminder Rules */}
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">{typeIcons[rule.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{rule.name}</h3>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {rule.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {rule.timing}
                      </span>
                      {rule.lastSent && (
                        <span>
                          Last sent:{" "}
                          {new Date(rule.lastSent).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Email Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" /> Email Settings
            </CardTitle>
            <CardDescription>
              Notifications will be sent to the configured team email addresses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">team@musicforwellbeing.org</p>
                <p className="text-xs text-muted-foreground">Primary contact</p>
              </div>
              <Badge>Active</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">director@musicforwellbeing.org</p>
                <p className="text-xs text-muted-foreground">Board updates only</p>
              </div>
              <Badge variant="secondary">Digest only</Badge>
            </div>
            <Button variant="outline" size="sm" className="mt-2">
              + Add recipient
            </Button>
          </CardContent>
        </Card>

        {/* Email Preview */}
        {showPreview && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Email Preview — Deadline Reminder</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-card p-5 space-y-4 text-sm">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>From:</strong> noreply@musicforwellbeing.org</p>
                  <p><strong>To:</strong> team@musicforwellbeing.org</p>
                  <p><strong>Subject:</strong> ⏰ Deadline Reminder: Youth Music — Incubator Fund (20 days left)</p>
                </div>
                <hr />
                <div className="space-y-3">
                  <p>Hi Music for Wellbeing team,</p>
                  <p>
                    This is a reminder that the <strong>Youth Music — Incubator Fund</strong> application
                    deadline is in <strong>20 days</strong> (28 March 2026).
                  </p>
                  <div className="bg-muted rounded-lg p-3 space-y-1">
                    <p><strong>Funder:</strong> Youth Music</p>
                    <p><strong>Programme:</strong> Incubator Fund</p>
                    <p><strong>Amount:</strong> £2,000 – £30,000</p>
                    <p><strong>Deadline:</strong> 28 March 2026</p>
                    <p><strong>Status:</strong> Applying</p>
                  </div>
                  <p>Make sure to complete and submit your application before the deadline.</p>
                  <p className="text-muted-foreground text-xs">
                    — Music for Wellbeing Funding Dashboard
                  </p>
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

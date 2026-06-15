import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bell, Mail, Clock, RefreshCw, CalendarCheck, Newspaper, Eye, X, Loader2, Pencil } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { useReminderRules } from "@/hooks/useReminderRules";
import { useReminderRecipients } from "@/hooks/useReminderRecipients";
import { useUpdateReminderRule } from "@/hooks/useUpdateReminderRule";
import { useAddReminderRecipient } from "@/hooks/useAddReminderRecipient";
import { useRemoveReminderRecipient } from "@/hooks/useRemoveReminderRecipient";
import { type ReminderRule } from "@/lib/mock-data";

const typeIcons: Record<string, React.ReactNode> = {
  deadline: <Clock className="h-5 w-5 text-warning" />,
  renewal: <RefreshCw className="h-5 w-5 text-primary" />,
  "re-eligibility": <CalendarCheck className="h-5 w-5 text-secondary" />,
  digest: <Newspaper className="h-5 w-5 text-muted-foreground" />,
};

function formatTiming(rule: ReminderRule): string {
  if (rule.cadence === "before_deadline" && rule.offsetsDays.length > 0) {
    const sorted = [...rule.offsetsDays].sort((a, b) => b - a);
    return `${sorted.join(", ")} days before deadline`;
  }
  return "";
}

const Reminders = () => {
  const { data: rules = [], isLoading: rulesLoading } = useReminderRules();
  const { data: recipients = [], isLoading: recipientsLoading } = useReminderRecipients();
  const updateRule = useUpdateReminderRule();
  const addRecipient = useAddReminderRecipient();
  const removeRecipient = useRemoveReminderRecipient();

  const [showPreview, setShowPreview] = useState(false);
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null);
  const [draftOffsets, setDraftOffsets] = useState<number[]>([]);
  const [offsetInput, setOffsetInput] = useState("");

  const isLoading = rulesLoading || recipientsLoading;

  const toggleRule = (rule: ReminderRule) => {
    updateRule.mutate(
      { id: rule.id, enabled: !rule.enabled },
      { onError: (err) => toast.error(`Failed to update rule: ${err.message}`) },
    );
  };

  const handleAddRecipient = () => {
    if (!newEmail || !newEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    addRecipient.mutate(
      { email: newEmail, label: newLabel },
      {
        onSuccess: () => {
          setShowAddRecipient(false);
          setNewEmail("");
          setNewLabel("");
          toast.success(`${newEmail.trim().toLowerCase()} added as recipient`);
        },
        onError: (err) => toast.error(`Failed to add recipient: ${err.message}`),
      },
    );
  };

  const openEditTiming = (rule: ReminderRule) => {
    setEditingRule(rule);
    setDraftOffsets([...rule.offsetsDays]);
    setOffsetInput("");
  };

  const addDraftOffset = () => {
    const n = parseInt(offsetInput, 10);
    if (!Number.isInteger(n) || n <= 0 || draftOffsets.includes(n)) {
      setOffsetInput("");
      return;
    }
    setDraftOffsets((prev) => [...prev, n]);
    setOffsetInput("");
  };

  const handleSaveTiming = () => {
    if (!editingRule) return;
    updateRule.mutate(
      { id: editingRule.id, offsets_days: draftOffsets },
      {
        onSuccess: () => {
          setEditingRule(null);
          toast.success("Reminder timing updated");
        },
        onError: (err) => toast.error(`Failed to update timing: ${err.message}`),
      },
    );
  };

  const handleRemoveRecipient = (id: string) => {
    removeRecipient.mutate(id, {
      onSuccess: () => toast.success("Recipient removed"),
      onError: (err) => toast.error(`Failed to remove recipient: ${err.message}`),
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

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
              <div className="shrink-0">{typeIcons[rule.type] ?? typeIcons.deadline}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{rule.name}</p>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted rounded-full px-2 py-0.5">{rule.type}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTiming(rule)}</span>
                  {rule.lastSent && (
                    <span>Last: {new Date(rule.lastSent).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEditTiming(rule)}
                title="Edit timing"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Switch
                checked={rule.enabled}
                onCheckedChange={() => toggleRule(rule)}
                disabled={updateRule.isPending}
              />
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
            {recipients.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No recipients yet. Add one to start receiving reminders.</p>
            )}
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">{r.email}</p>
                  {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.enabled ? "default" : "secondary"} className="rounded-full">
                    {r.enabled ? "Active" : "Disabled"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemoveRecipient(r.id)}
                    disabled={removeRecipient.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => setShowAddRecipient(true)}>+ Add recipient</Button>
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

      {/* Edit Timing Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => { if (!open) setEditingRule(null); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit reminder timing</DialogTitle>
            <DialogDescription>
              Choose how many days before the deadline to send reminders for "{editingRule?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {[...draftOffsets].sort((a, b) => b - a).map((n) => (
                <span key={n} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {n}d
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setDraftOffsets((prev) => prev.filter((x) => x !== n))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {draftOffsets.length === 0 && (
                <p className="text-sm text-muted-foreground">No offsets set. Add at least one.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Days before deadline"
                value={offsetInput}
                onChange={(e) => setOffsetInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraftOffset(); } }}
                className="rounded-xl"
              />
              <Button variant="outline" className="rounded-xl shrink-0" onClick={addDraftOffset}>
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={handleSaveTiming}
              className="rounded-xl"
              disabled={draftOffsets.length === 0 || updateRule.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Recipient Dialog */}
      <Dialog open={showAddRecipient} onOpenChange={setShowAddRecipient}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Recipient</DialogTitle>
            <DialogDescription>Add a new email address to receive notifications.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="colleague@organisation.org"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input
                placeholder="e.g. Finance team"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRecipient(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleAddRecipient} className="rounded-xl" disabled={addRecipient.isPending}>
              Add Recipient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Reminders;

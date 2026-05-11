import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GripVertical, Plus, ChevronDown, ChevronUp, Loader2, PartyPopper } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { useOpportunities } from "@/hooks/useOpportunities";
import { supabase } from "@/lib/supabaseClient";
import {
  formatCurrency,
  daysUntil,
  type FundingOpportunity,
  type OpportunityStatus,
} from "@/lib/mock-data";

const columns: { id: OpportunityStatus; label: string; color: string }[] = [
  { id: "identified", label: "Identified", color: "bg-muted-foreground" },
  { id: "researching", label: "Researching", color: "bg-primary" },
  { id: "applying", label: "Applying", color: "bg-warning" },
  { id: "submitted", label: "Submitted", color: "bg-secondary" },
  { id: "awarded", label: "Awarded", color: "bg-success" },
  { id: "rejected", label: "Rejected", color: "bg-destructive" },
  { id: "dismissed", label: "Dismissed", color: "bg-muted" },
];

const emptyForm = {
  funderName: "",
  programName: "",
  amount: "",
  amountMax: "",
  type: "trust" as FundingOpportunity["type"],
  deadline: "",
  location: "UK-wide",
  durationMonths: "12",
  description: "",
  website: "",
  contactName: "",
  contactEmail: "",
  notes: "",
};

type PendingMove = {
  opp: FundingOpportunity;
  fromStatus: OpportunityStatus;
  toStatus: "awarded" | "rejected" | "dismissed";
};

const Pipeline = () => {
  const queryClient = useQueryClient();
  const { data: fetchedOpportunities = [], isLoading } = useOpportunities();
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newOpp, setNewOpp] = useState(emptyForm);

  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [awardedForm, setAwardedForm] = useState({ expirationDate: "", amountAwarded: "" });
  const [rejectedForm, setRejectedForm] = useState({ reapplicationDate: "" });
  const [dismissedForm, setDismissedForm] = useState({ dismissalReason: "" });

  const handleDragStart = (id: string) => setDraggedId(id);

  const persistStatus = async (
    id: string,
    targetStatus: OpportunityStatus,
    extra: Record<string, unknown> = {}
  ) => {
    if (!supabase) return { error: { message: "Supabase not configured" } as { message: string } };
    return supabase
      .from("opportunities")
      .update({ status: targetStatus, updated_at: new Date().toISOString(), ...extra })
      .eq("id", id);
  };

  const handleDrop = async (targetStatus: OpportunityStatus) => {
    if (!draggedId) return;
    const movedId = draggedId;
    const moved = opportunities.find((o) => o.id === movedId);
    setDraggedId(null);
    setDragOverCol(null);
    if (!moved || moved.status === targetStatus) return;

    if (targetStatus === "awarded" || targetStatus === "rejected" || targetStatus === "dismissed") {
      setPendingMove({ opp: moved, fromStatus: moved.status, toStatus: targetStatus });
      setAwardedForm({ expirationDate: "", amountAwarded: String(moved.amount || "") });
      setRejectedForm({ reapplicationDate: "" });
      setDismissedForm({ dismissalReason: "" });
      // optimistic move into target column while dialog is open
      setOpportunities((prev) => prev.map((o) => (o.id === movedId ? { ...o, status: targetStatus } : o)));
      return;
    }

    const prevStatus = moved.status;
    setOpportunities((prev) => prev.map((o) => (o.id === movedId ? { ...o, status: targetStatus } : o)));
    const { error } = await persistStatus(movedId, targetStatus);
    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
      setOpportunities((prev) => prev.map((o) => (o.id === movedId ? { ...o, status: prevStatus } : o)));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["activeFunding"] });
  };

  const cancelPendingMove = () => {
    if (!pendingMove) return;
    const { opp, fromStatus } = pendingMove;
    setOpportunities((prev) => prev.map((o) => (o.id === opp.id ? { ...o, status: fromStatus } : o)));
    setPendingMove(null);
  };

  const submitAwarded = async () => {
    if (!pendingMove) return;
    if (!awardedForm.expirationDate || !awardedForm.amountAwarded) {
      toast.error("Please fill in expiration date and amount awarded");
      return;
    }
    const amountAwarded = parseFloat(awardedForm.amountAwarded);
    setSubmitting(true);
    const { error } = await persistStatus(pendingMove.opp.id, "awarded", {
      expiration_date: awardedForm.expirationDate,
      amount_awarded: amountAwarded,
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "awarded", expirationDate: awardedForm.expirationDate, amountAwarded }
          : o
      )
    );
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["activeFunding"] });
    setPendingMove(null);
    toast.success("Congratulations on the award!");
  };

  const submitRejected = async () => {
    if (!pendingMove) return;
    if (!rejectedForm.reapplicationDate) {
      toast.error("Please provide a reapplication date");
      return;
    }
    setSubmitting(true);
    const { error } = await persistStatus(pendingMove.opp.id, "rejected", {
      reapplication_date: rejectedForm.reapplicationDate,
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "rejected", reapplicationDate: rejectedForm.reapplicationDate }
          : o
      )
    );
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    setPendingMove(null);
    toast.success("Marked as rejected");
  };

  const submitDismissed = async () => {
    if (!pendingMove) return;
    if (!dismissedForm.dismissalReason.trim()) {
      toast.error("Please provide a dismissal reason");
      return;
    }
    setSubmitting(true);
    const { error } = await persistStatus(pendingMove.opp.id, "dismissed", {
      dismissal_reason: dismissedForm.dismissalReason,
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "dismissed", dismissalReason: dismissedForm.dismissalReason }
          : o
      )
    );
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    setPendingMove(null);
    toast.success("Opportunity dismissed");
  };

  const toggleCollapse = (colId: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      next.has(colId) ? next.delete(colId) : next.add(colId);
      return next;
    });
  };

  const totalValue = (items: FundingOpportunity[]) =>
    items.reduce((s, o) => s + (o.status === "awarded" && o.amountAwarded != null ? o.amountAwarded : o.amount), 0);

  const handleAddOpportunity = async () => {
    if (
      !newOpp.funderName ||
      !newOpp.programName ||
      !newOpp.amount ||
      !newOpp.deadline ||
      !newOpp.location ||
      !newOpp.durationMonths ||
      !newOpp.description ||
      !newOpp.website
    ) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!supabase) {
      toast.error("Supabase not configured");
      return;
    }

    const id = `custom-${Date.now()}`;
    const row = {
      id,
      funder_name: newOpp.funderName,
      program_name: newOpp.programName,
      amount: parseFloat(newOpp.amount),
      amount_max: newOpp.amountMax ? parseFloat(newOpp.amountMax) : null,
      type: newOpp.type,
      deadline: newOpp.deadline,
      location: newOpp.location,
      duration_months: parseInt(newOpp.durationMonths, 10),
      status: "identified" as OpportunityStatus,
      description: newOpp.description,
      website: newOpp.website,
      contact_name: newOpp.contactName || null,
      contact_email: newOpp.contactEmail || null,
      notes: newOpp.notes,
    };

    setSubmitting(true);
    const { data, error } = await supabase
      .from("opportunities")
      .insert(row)
      .select()
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`Failed to add: ${error.message}`);
      return;
    }

    const opp: FundingOpportunity = {
      id: String(data.id),
      funderName: data.funder_name,
      programName: data.program_name,
      amount: Number(data.amount),
      amountMax: data.amount_max != null ? Number(data.amount_max) : undefined,
      type: data.type,
      deadline: data.deadline,
      location: data.location,
      durationMonths: Number(data.duration_months),
      status: data.status,
      score: Number(data.final_score ?? data.score ?? 0),
      tags: Array.isArray(data.tags) ? data.tags : [],
      description: data.description ?? "",
      notes: data.notes ?? "",
      website: data.website ?? "",
      contactName: data.contact_name ?? undefined,
      contactEmail: data.contact_email ?? undefined,
    };

    setOpportunities((prev) => [...prev, opp]);
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    setShowAddDialog(false);
    setNewOpp(emptyForm);
    toast.success(`"${opp.funderName}" added to pipeline`);
  };

  if (!hasInitialized && fetchedOpportunities.length > 0) {
    setOpportunities(fetchedOpportunities);
    setHasInitialized(true);
  }

  if (isLoading && !hasInitialized) {
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-muted-foreground mt-1">Drag opportunities between stages.</p>
          </div>
          <Button className="gap-2 rounded-xl" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" /> Add Opportunity
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {columns.filter((c) => c.id !== "dismissed").map((col) => {
            const count = opportunities.filter((o) => o.status === col.id).length;
            return (
              <div key={col.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <span className="text-muted-foreground">{col.label}</span>
                <span className="font-semibold">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((col) => {
            const items = opportunities.filter((o) => o.status === col.id);
            const isCollapsed = collapsedCols.has(col.id);
            const isDragOver = dragOverCol === col.id;

            return (
              <div
                key={col.id}
                className="min-w-[260px] w-[260px] shrink-0 flex flex-col"
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.id)}
              >
                <button
                  onClick={() => toggleCollapse(col.id)}
                  className="rounded-t-xl px-4 py-3 flex items-center justify-between w-full text-left border border-b-0 bg-card hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {items.length > 0 && col.id !== "dismissed" && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {formatCurrency(totalValue(items))}
                      </span>
                    )}
                    {isCollapsed ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div
                    className={`border border-t-0 rounded-b-xl flex-1 transition-colors ${
                      isDragOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/20"
                    }`}
                  >
                    <ScrollArea className="h-[420px]">
                      <div className="p-2 space-y-2">
                        {items.map((opp) => (
                          <div
                            key={opp.id}
                            draggable
                            onDragStart={() => handleDragStart(opp.id)}
                            className={`rounded-xl border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                              draggedId === opp.id ? "opacity-40 scale-95" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight">{opp.funderName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{opp.programName}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pl-6">
                              <span className="font-semibold">
                                {formatCurrency(opp.status === "awarded" && opp.amountAwarded != null ? opp.amountAwarded : opp.amount)}
                              </span>
                              {opp.status === "awarded" && opp.expirationDate ? (
                                <span className="text-muted-foreground">expires {opp.expirationDate}</span>
                              ) : opp.status === "rejected" && opp.reapplicationDate ? (
                                <span className="text-muted-foreground">reapply {opp.reapplicationDate}</span>
                              ) : opp.status === "dismissed" ? null : (
                                <span className="text-muted-foreground">{daysUntil(opp.deadline)}d left</span>
                              )}
                            </div>
                            {opp.status === "dismissed" && opp.dismissalReason && (
                              <p className="text-[10px] text-muted-foreground pl-6 italic line-clamp-2">{opp.dismissalReason}</p>
                            )}
                            {opp.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pl-6">
                                {opp.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className={`text-center py-12 rounded-xl border-2 border-dashed transition-colors ${
                            isDragOver ? "border-primary/40 bg-primary/5" : "border-muted"
                          }`}>
                            <p className="text-xs text-muted-foreground">
                              {isDragOver ? "Drop here" : "No items"}
                            </p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {isCollapsed && (
                  <div className="border border-t-0 rounded-b-xl bg-muted/10 px-4 py-2">
                    <p className="text-xs text-muted-foreground">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                      {col.id !== "dismissed" && ` · ${formatCurrency(totalValue(items))}`}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Opportunity Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Opportunity</DialogTitle>
            <DialogDescription>Add a new funding opportunity to your pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Funder Name *</Label>
                <Input
                  placeholder="e.g. Arts Council England"
                  value={newOpp.funderName}
                  onChange={(e) => setNewOpp((p) => ({ ...p, funderName: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Programme Name *</Label>
                <Input
                  placeholder="e.g. Project Grants"
                  value={newOpp.programName}
                  onChange={(e) => setNewOpp((p) => ({ ...p, programName: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (£) *</Label>
                <Input
                  type="number"
                  placeholder="10000"
                  value={newOpp.amount}
                  onChange={(e) => setNewOpp((p) => ({ ...p, amount: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount Max (£)</Label>
                <Input
                  type="number"
                  placeholder="optional"
                  value={newOpp.amountMax}
                  onChange={(e) => setNewOpp((p) => ({ ...p, amountMax: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Deadline *</Label>
                <Input
                  type="date"
                  value={newOpp.deadline}
                  onChange={(e) => setNewOpp((p) => ({ ...p, deadline: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={newOpp.type} onValueChange={(v) => setNewOpp((p) => ({ ...p, type: v as FundingOpportunity["type"] }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trust">Trust</SelectItem>
                    <SelectItem value="lottery">Lottery</SelectItem>
                    <SelectItem value="government">Government</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="grant">Grant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location *</Label>
                <Input
                  placeholder="e.g. UK-wide"
                  value={newOpp.location}
                  onChange={(e) => setNewOpp((p) => ({ ...p, location: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (months) *</Label>
                <Input
                  type="number"
                  placeholder="12"
                  value={newOpp.durationMonths}
                  onChange={(e) => setNewOpp((p) => ({ ...p, durationMonths: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Website *</Label>
              <Input
                placeholder="https://..."
                value={newOpp.website}
                onChange={(e) => setNewOpp((p) => ({ ...p, website: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  placeholder="optional"
                  value={newOpp.contactName}
                  onChange={(e) => setNewOpp((p) => ({ ...p, contactName: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  placeholder="optional"
                  value={newOpp.contactEmail}
                  onChange={(e) => setNewOpp((p) => ({ ...p, contactEmail: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="What this funding is for"
                value={newOpp.description}
                onChange={(e) => setNewOpp((p) => ({ ...p, description: e.target.value }))}
                className="rounded-xl"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Internal notes (optional)"
                value={newOpp.notes}
                onChange={(e) => setNewOpp((p) => ({ ...p, notes: e.target.value }))}
                className="rounded-xl"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={handleAddOpportunity} className="rounded-xl" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Awarded Dialog */}
      <Dialog
        open={pendingMove?.toStatus === "awarded"}
        onOpenChange={(open) => { if (!open) cancelPendingMove(); }}
      >
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-success" /> Congratulations!
            </DialogTitle>
            <DialogDescription>
              {pendingMove?.opp.funderName} — {pendingMove?.opp.programName}. Enter the award details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount Awarded (£) *</Label>
              <Input
                type="number"
                value={awardedForm.amountAwarded}
                onChange={(e) => setAwardedForm((p) => ({ ...p, amountAwarded: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Funding Expiration Date *</Label>
              <Input
                type="date"
                value={awardedForm.expirationDate}
                onChange={(e) => setAwardedForm((p) => ({ ...p, expirationDate: e.target.value }))}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitAwarded} className="rounded-xl" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejected Dialog */}
      <Dialog
        open={pendingMove?.toStatus === "rejected"}
        onOpenChange={(open) => { if (!open) cancelPendingMove(); }}
      >
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Mark as Rejected</DialogTitle>
            <DialogDescription>
              When can we reapply? The opportunity will reappear as "Identified" after that date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reapplication Date *</Label>
              <Input
                type="date"
                value={rejectedForm.reapplicationDate}
                onChange={(e) => setRejectedForm({ reapplicationDate: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitRejected} className="rounded-xl" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismissed Dialog */}
      <Dialog
        open={pendingMove?.toStatus === "dismissed"}
        onOpenChange={(open) => { if (!open) cancelPendingMove(); }}
      >
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Dismiss Opportunity</DialogTitle>
            <DialogDescription>
              Dismissed opportunities are kept for reference but excluded from counts and active funding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason for dismissal *</Label>
              <Textarea
                placeholder="Why are we dropping this opportunity?"
                value={dismissedForm.dismissalReason}
                onChange={(e) => setDismissedForm({ dismissalReason: e.target.value })}
                className="rounded-xl"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitDismissed} className="rounded-xl" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pipeline;

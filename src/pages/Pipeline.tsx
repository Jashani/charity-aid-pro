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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GripVertical, Plus, ChevronDown, ChevronUp, Loader2, PartyPopper, Pencil, ExternalLink } from "lucide-react";
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
  { id: "on_hold", label: "On Hold", color: "bg-orange-400" },
  { id: "researching", label: "Researching", color: "bg-primary" },
  { id: "applying", label: "Applying", color: "bg-warning" },
  { id: "submitted", label: "Submitted", color: "bg-secondary" },
  { id: "awarded", label: "Awarded", color: "bg-success" },
  { id: "funds_received", label: "Funds Received", color: "bg-emerald-500" },
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
  purpose: "",
  financialYear: "",
};

type EditForm = typeof emptyForm & {
  status: OpportunityStatus;
  expirationDate: string;
  amountAwarded: string;
  tranches: string;
  dateFundingReceived: string;
  submissionDate: string;
  expectedResultsDate: string;
  reapplicationDate: string;
  feedback: string;
  dismissalReason: string;
};

const emptyEditForm: EditForm = {
  ...emptyForm,
  location: "",
  durationMonths: "",
  status: "identified",
  expirationDate: "",
  amountAwarded: "",
  tranches: "",
  dateFundingReceived: "",
  submissionDate: "",
  expectedResultsDate: "",
  reapplicationDate: "",
  feedback: "",
  dismissalReason: "",
};

type PendingMove = {
  opp: FundingOpportunity;
  fromStatus: OpportunityStatus;
  toStatus: "awarded" | "rejected" | "dismissed" | "submitted" | "funds_received";
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
  const [awardedForm, setAwardedForm] = useState({ expirationDate: "", amountAwarded: "", tranches: "", dateFundingReceived: "" });
  const [rejectedForm, setRejectedForm] = useState({ reapplicationDate: "", feedback: "" });
  const [dismissedForm, setDismissedForm] = useState({ dismissalReason: "" });
  const [submittedForm, setSubmittedForm] = useState({ expectedResultsDate: "" });
  const [fundsReceivedForm, setFundsReceivedForm] = useState({ dateFundingReceived: "" });

  const [editingOpp, setEditingOpp] = useState<FundingOpportunity | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

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

    if (targetStatus === "awarded" || targetStatus === "rejected" || targetStatus === "dismissed" || targetStatus === "submitted" || targetStatus === "funds_received") {
      setPendingMove({ opp: moved, fromStatus: moved.status, toStatus: targetStatus });
      setAwardedForm({ expirationDate: "", amountAwarded: String(moved.amount || ""), tranches: "", dateFundingReceived: "" });
      setRejectedForm({ reapplicationDate: "", feedback: "" });
      setDismissedForm({ dismissalReason: "" });
      setSubmittedForm({ expectedResultsDate: "" });
      setFundsReceivedForm({ dateFundingReceived: new Date().toISOString().slice(0, 10) });
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
      ...(awardedForm.tranches ? { tranches: parseInt(awardedForm.tranches, 10) } : {}),
      ...(awardedForm.dateFundingReceived ? { date_funding_received: awardedForm.dateFundingReceived } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? {
              ...o,
              status: "awarded",
              expirationDate: awardedForm.expirationDate,
              amountAwarded,
              tranches: awardedForm.tranches ? parseInt(awardedForm.tranches, 10) : undefined,
              dateFundingReceived: awardedForm.dateFundingReceived || undefined,
            }
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
      ...(rejectedForm.feedback.trim() ? { feedback: rejectedForm.feedback.trim() } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "rejected", reapplicationDate: rejectedForm.reapplicationDate, feedback: rejectedForm.feedback.trim() || undefined }
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

  const submitSubmitted = async () => {
    if (!pendingMove) return;
    const today = new Date().toISOString().slice(0, 10);
    setSubmitting(true);
    const { error } = await persistStatus(pendingMove.opp.id, "submitted", {
      submission_date: today,
      ...(submittedForm.expectedResultsDate ? { expected_results_date: submittedForm.expectedResultsDate } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "submitted", submissionDate: today, expectedResultsDate: submittedForm.expectedResultsDate || undefined }
          : o
      )
    );
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    setPendingMove(null);
    toast.success("Marked as submitted");
  };

  const submitFundsReceived = async () => {
    if (!pendingMove) return;
    setSubmitting(true);
    const { error } = await persistStatus(pendingMove.opp.id, "funds_received", {
      ...(fundsReceivedForm.dateFundingReceived ? { date_funding_received: fundsReceivedForm.dateFundingReceived } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === pendingMove.opp.id
          ? { ...o, status: "funds_received", dateFundingReceived: fundsReceivedForm.dateFundingReceived || undefined }
          : o
      )
    );
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["activeFunding"] });
    setPendingMove(null);
    toast.success("Funds received recorded");
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

  const handleCardClick = (opp: FundingOpportunity) => {
    setEditingOpp(opp);
    setEditForm({
      funderName: opp.funderName,
      programName: opp.programName,
      amount: String(opp.amount),
      amountMax: opp.amountMax != null ? String(opp.amountMax) : "",
      type: opp.type,
      deadline: opp.deadline,
      location: opp.location,
      durationMonths: String(opp.durationMonths),
      description: opp.description,
      website: opp.website,
      contactName: opp.contactName ?? "",
      contactEmail: opp.contactEmail ?? "",
      notes: opp.notes,
      purpose: opp.purpose ?? "",
      financialYear: opp.financialYear ?? "",
      status: opp.status,
      expirationDate: opp.expirationDate ?? "",
      amountAwarded: opp.amountAwarded != null ? String(opp.amountAwarded) : "",
      tranches: opp.tranches != null ? String(opp.tranches) : "",
      dateFundingReceived: opp.dateFundingReceived ?? "",
      submissionDate: opp.submissionDate ?? "",
      expectedResultsDate: opp.expectedResultsDate ?? "",
      reapplicationDate: opp.reapplicationDate ?? "",
      feedback: opp.feedback ?? "",
      dismissalReason: opp.dismissalReason ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingOpp) return;
    if (!editForm.funderName || !editForm.programName || !editForm.amount || !editForm.deadline) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!supabase) {
      toast.error("Supabase not configured");
      return;
    }

    setEditSubmitting(true);
    const { error } = await supabase
      .from("opportunities")
      .update({
        funder_name: editForm.funderName,
        program_name: editForm.programName,
        amount: parseFloat(editForm.amount),
        amount_max: editForm.amountMax ? parseFloat(editForm.amountMax) : null,
        type: editForm.type,
        deadline: editForm.deadline,
        location: editForm.location,
        duration_months: parseInt(editForm.durationMonths, 10) || 12,
        description: editForm.description,
        website: editForm.website,
        contact_name: editForm.contactName || null,
        contact_email: editForm.contactEmail || null,
        notes: editForm.notes,
        purpose: editForm.purpose || null,
        financial_year: editForm.financialYear || null,
        status: editForm.status,
        expiration_date: editForm.expirationDate || null,
        amount_awarded: editForm.amountAwarded ? parseFloat(editForm.amountAwarded) : null,
        tranches: editForm.tranches ? parseInt(editForm.tranches, 10) : null,
        date_funding_received: editForm.dateFundingReceived || null,
        submission_date: editForm.submissionDate || null,
        expected_results_date: editForm.expectedResultsDate || null,
        reapplication_date: editForm.reapplicationDate || null,
        feedback: editForm.feedback || null,
        dismissal_reason: editForm.dismissalReason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingOpp.id);
    setEditSubmitting(false);

    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }

    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === editingOpp.id
          ? {
              ...o,
              funderName: editForm.funderName,
              programName: editForm.programName,
              amount: parseFloat(editForm.amount),
              amountMax: editForm.amountMax ? parseFloat(editForm.amountMax) : undefined,
              type: editForm.type,
              deadline: editForm.deadline,
              location: editForm.location,
              durationMonths: parseInt(editForm.durationMonths, 10) || 12,
              description: editForm.description,
              website: editForm.website,
              contactName: editForm.contactName || undefined,
              contactEmail: editForm.contactEmail || undefined,
              notes: editForm.notes,
              purpose: editForm.purpose || undefined,
              financialYear: editForm.financialYear || undefined,
              status: editForm.status,
              expirationDate: editForm.expirationDate || undefined,
              amountAwarded: editForm.amountAwarded ? parseFloat(editForm.amountAwarded) : undefined,
              tranches: editForm.tranches ? parseInt(editForm.tranches, 10) : undefined,
              dateFundingReceived: editForm.dateFundingReceived || undefined,
              submissionDate: editForm.submissionDate || undefined,
              expectedResultsDate: editForm.expectedResultsDate || undefined,
              reapplicationDate: editForm.reapplicationDate || undefined,
              feedback: editForm.feedback || undefined,
              dismissalReason: editForm.dismissalReason || undefined,
            }
          : o
      )
    );

    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["activeFunding"] });
    setEditingOpp(null);
    toast.success("Opportunity updated");
  };

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
      purpose: newOpp.purpose || null,
      financial_year: newOpp.financialYear || null,
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
            <p className="text-muted-foreground mt-1">Drag opportunities between stages, or click to edit.</p>
          </div>
          <Button className="gap-2 rounded-xl" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" /> Add Opportunity
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {columns.filter((c) => c.id !== "dismissed" && c.id !== "funds_received").map((col) => {
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
                    {items.length > 0 && col.id !== "dismissed" && col.id !== "on_hold" && (
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
                    <div className="h-[420px] overflow-y-auto overflow-x-hidden">
                      <div className="p-2 space-y-2">
                        {items.map((opp) => (
                          <div
                            key={opp.id}
                            draggable
                            onDragStart={() => handleDragStart(opp.id)}
                            onClick={() => handleCardClick(opp)}
                            className={`group rounded-xl border bg-card p-3 space-y-2 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 overflow-hidden ${
                              draggedId === opp.id ? "opacity-40 scale-95" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <GripVertical
                                className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0 cursor-grab"
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight truncate">{opp.funderName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{opp.programName}</p>
                              </div>
                              <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0 mt-0.5" />
                            </div>
                            <div className="flex items-center justify-between text-xs pl-6">
                              <span className="font-semibold">
                                {formatCurrency(opp.status === "awarded" && opp.amountAwarded != null ? opp.amountAwarded : opp.amount)}
                              </span>
                              {opp.status === "awarded" && opp.expirationDate ? (
                                <span className="text-muted-foreground">expires {opp.expirationDate}</span>
                              ) : opp.status === "rejected" && opp.reapplicationDate ? (
                                <span className="text-muted-foreground">reapply {opp.reapplicationDate}</span>
                              ) : opp.status === "submitted" && opp.expectedResultsDate ? (
                                <span className="text-muted-foreground">results {opp.expectedResultsDate}</span>
                              ) : opp.status === "funds_received" && opp.dateFundingReceived ? (
                                <span className="text-muted-foreground">received {opp.dateFundingReceived}</span>
                              ) : opp.status === "dismissed" || opp.status === "on_hold" ? null : !opp.deadline ? (
                                <span className="text-muted-foreground">No deadline</span>
                              ) : daysUntil(opp.deadline) < 0 ? (
                                <span className="text-destructive font-medium">Deadline passed</span>
                              ) : (
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
                    </div>
                  </div>
                )}

                {isCollapsed && (
                  <div className="border border-t-0 rounded-b-xl bg-muted/10 px-4 py-2">
                    <p className="text-xs text-muted-foreground">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                      {col.id !== "dismissed" && col.id !== "on_hold" && ` · ${formatCurrency(totalValue(items))}`}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Opportunity Sheet */}
      <Sheet open={!!editingOpp} onOpenChange={(open) => { if (!open) setEditingOpp(null); }}>
        <SheetContent className="sm:max-w-lg flex flex-col overflow-hidden p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Edit Opportunity</SheetTitle>
            <SheetDescription>
              {editingOpp?.funderName} — {editingOpp?.programName}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-5">

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as OpportunityStatus }))}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editForm.status === "awarded" && (
                <div className="rounded-xl border p-4 space-y-3 bg-success/5 border-success/20">
                  <p className="text-xs font-semibold text-success uppercase tracking-wide">Award Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Amount Awarded (£) *</Label>
                      <Input type="number" value={editForm.amountAwarded} onChange={(e) => setEditForm((p) => ({ ...p, amountAwarded: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Expiration Date *</Label>
                      <Input type="date" value={editForm.expirationDate} onChange={(e) => setEditForm((p) => ({ ...p, expirationDate: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tranches</Label>
                      <Input type="number" placeholder="e.g. 1" value={editForm.tranches} onChange={(e) => setEditForm((p) => ({ ...p, tranches: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Date Funding Received</Label>
                      <Input type="date" value={editForm.dateFundingReceived} onChange={(e) => setEditForm((p) => ({ ...p, dateFundingReceived: e.target.value }))} className="rounded-xl" />
                    </div>
                  </div>
                </div>
              )}

              {editForm.status === "funds_received" && (
                <div className="rounded-xl border p-4 space-y-3 bg-emerald-500/5 border-emerald-500/20">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Funds Received</p>
                  <div className="space-y-2">
                    <Label>Date Funding Received</Label>
                    <Input type="date" value={editForm.dateFundingReceived} onChange={(e) => setEditForm((p) => ({ ...p, dateFundingReceived: e.target.value }))} className="rounded-xl" />
                  </div>
                </div>
              )}

              {editForm.status === "submitted" && (
                <div className="rounded-xl border p-4 space-y-3 bg-secondary/5 border-secondary/20">
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Submission Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Submission Date</Label>
                      <Input type="date" value={editForm.submissionDate} onChange={(e) => setEditForm((p) => ({ ...p, submissionDate: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Expected Results Date</Label>
                      <Input type="date" value={editForm.expectedResultsDate} onChange={(e) => setEditForm((p) => ({ ...p, expectedResultsDate: e.target.value }))} className="rounded-xl" />
                    </div>
                  </div>
                </div>
              )}

              {editForm.status === "rejected" && (
                <div className="rounded-xl border p-4 space-y-3 bg-destructive/5 border-destructive/20">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Rejection Details</p>
                  <div className="space-y-2">
                    <Label>Reapplication Date *</Label>
                    <Input type="date" value={editForm.reapplicationDate} onChange={(e) => setEditForm((p) => ({ ...p, reapplicationDate: e.target.value }))} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label>Funder Feedback</Label>
                    <Textarea placeholder="Any feedback from the funder" value={editForm.feedback} onChange={(e) => setEditForm((p) => ({ ...p, feedback: e.target.value }))} className="rounded-xl" rows={2} />
                  </div>
                </div>
              )}

              {editForm.status === "dismissed" && (
                <div className="rounded-xl border p-4 space-y-3 bg-muted/30 border-muted">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dismissal Details</p>
                  <div className="space-y-2">
                    <Label>Reason for Dismissal *</Label>
                    <Textarea placeholder="Why are we dropping this opportunity?" value={editForm.dismissalReason} onChange={(e) => setEditForm((p) => ({ ...p, dismissalReason: e.target.value }))} className="rounded-xl" rows={2} />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Funder & Programme</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Funder Name *</Label>
                  <Input value={editForm.funderName} onChange={(e) => setEditForm((p) => ({ ...p, funderName: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Programme Name *</Label>
                  <Input value={editForm.programName} onChange={(e) => setEditForm((p) => ({ ...p, programName: e.target.value }))} className="rounded-xl" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Amount (£) *</Label>
                  <Input type="number" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Amount Max (£)</Label>
                  <Input type="number" placeholder="optional" value={editForm.amountMax} onChange={(e) => setEditForm((p) => ({ ...p, amountMax: e.target.value }))} className="rounded-xl" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Application Deadline *</Label>
                  <Input type="date" value={editForm.deadline} onChange={(e) => setEditForm((p) => ({ ...p, deadline: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm((p) => ({ ...p, type: v as FundingOpportunity["type"] }))}>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Duration (months)</Label>
                  <Input type="number" value={editForm.durationMonths} onChange={(e) => setEditForm((p) => ({ ...p, durationMonths: e.target.value }))} className="rounded-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Website</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://..."
                    value={editForm.website}
                    onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))}
                    className="rounded-xl"
                  />
                  {editForm.website && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-xl shrink-0"
                      onClick={() => {
                        const url = editForm.website;
                        window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank");
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input placeholder="optional" value={editForm.contactName} onChange={(e) => setEditForm((p) => ({ ...p, contactName: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input type="email" placeholder="optional" value={editForm.contactEmail} onChange={(e) => setEditForm((p) => ({ ...p, contactEmail: e.target.value }))} className="rounded-xl" />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} className="rounded-xl" rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Internal notes" value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} className="rounded-xl" rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Purpose</Label>
                  <Select value={editForm.purpose} onValueChange={(v) => setEditForm((p) => ({ ...p, purpose: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="core">Core</SelectItem>
                      <SelectItem value="unrestricted">Unrestricted</SelectItem>
                      <SelectItem value="core_and_project">Core &amp; Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Financial Year</Label>
                  <Input placeholder="e.g. 2026-2027" value={editForm.financialYear} onChange={(e) => setEditForm((p) => ({ ...p, financialYear: e.target.value }))} className="rounded-xl" />
                </div>
              </div>

              {editingOpp && (editingOpp.score > 0 || editingOpp.tags.length > 0) && (
                <div className="rounded-xl border p-4 space-y-2 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Computed</p>
                  {editingOpp.score > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Match score</span>
                      <span className="text-sm font-bold">{editingOpp.score}</span>
                    </div>
                  )}
                  {editingOpp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {editingOpp.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs rounded-full">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="h-2" />
            </div>
          </ScrollArea>

          <SheetFooter className="px-6 py-4 border-t gap-2">
            <Button variant="outline" onClick={() => setEditingOpp(null)} disabled={editSubmitting} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editSubmitting} className="rounded-xl">
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
                <Input placeholder="e.g. Arts Council England" value={newOpp.funderName} onChange={(e) => setNewOpp((p) => ({ ...p, funderName: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Programme Name *</Label>
                <Input placeholder="e.g. Project Grants" value={newOpp.programName} onChange={(e) => setNewOpp((p) => ({ ...p, programName: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (£) *</Label>
                <Input type="number" placeholder="10000" value={newOpp.amount} onChange={(e) => setNewOpp((p) => ({ ...p, amount: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Amount Max (£)</Label>
                <Input type="number" placeholder="optional" value={newOpp.amountMax} onChange={(e) => setNewOpp((p) => ({ ...p, amountMax: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Deadline *</Label>
                <Input type="date" value={newOpp.deadline} onChange={(e) => setNewOpp((p) => ({ ...p, deadline: e.target.value }))} className="rounded-xl" />
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
                <Input placeholder="e.g. UK-wide" value={newOpp.location} onChange={(e) => setNewOpp((p) => ({ ...p, location: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Duration (months) *</Label>
                <Input type="number" placeholder="12" value={newOpp.durationMonths} onChange={(e) => setNewOpp((p) => ({ ...p, durationMonths: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website *</Label>
              <Input placeholder="https://..." value={newOpp.website} onChange={(e) => setNewOpp((p) => ({ ...p, website: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input placeholder="optional" value={newOpp.contactName} onChange={(e) => setNewOpp((p) => ({ ...p, contactName: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input type="email" placeholder="optional" value={newOpp.contactEmail} onChange={(e) => setNewOpp((p) => ({ ...p, contactEmail: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea placeholder="What this funding is for" value={newOpp.description} onChange={(e) => setNewOpp((p) => ({ ...p, description: e.target.value }))} className="rounded-xl" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Internal notes (optional)" value={newOpp.notes} onChange={(e) => setNewOpp((p) => ({ ...p, notes: e.target.value }))} className="rounded-xl" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Select value={newOpp.purpose} onValueChange={(v) => setNewOpp((p) => ({ ...p, purpose: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="core">Core</SelectItem>
                    <SelectItem value="unrestricted">Unrestricted</SelectItem>
                    <SelectItem value="core_and_project">Core &amp; Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Financial Year</Label>
                <Input placeholder="e.g. 2026-2027" value={newOpp.financialYear} onChange={(e) => setNewOpp((p) => ({ ...p, financialYear: e.target.value }))} className="rounded-xl" />
              </div>
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
      <Dialog open={pendingMove?.toStatus === "awarded"} onOpenChange={(open) => { if (!open) cancelPendingMove(); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PartyPopper className="h-5 w-5 text-success" /> Congratulations!</DialogTitle>
            <DialogDescription>{pendingMove?.opp.funderName} — {pendingMove?.opp.programName}. Enter the award details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount Awarded (£) *</Label>
              <Input type="number" value={awardedForm.amountAwarded} onChange={(e) => setAwardedForm((p) => ({ ...p, amountAwarded: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Funding Expiration Date *</Label>
              <Input type="date" value={awardedForm.expirationDate} onChange={(e) => setAwardedForm((p) => ({ ...p, expirationDate: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tranches</Label>
                <Input type="number" placeholder="e.g. 1" value={awardedForm.tranches} onChange={(e) => setAwardedForm((p) => ({ ...p, tranches: e.target.value }))} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Date Funding Received</Label>
                <Input type="date" value={awardedForm.dateFundingReceived} onChange={(e) => setAwardedForm((p) => ({ ...p, dateFundingReceived: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitAwarded} className="rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejected Dialog */}
      <Dialog open={pendingMove?.toStatus === "rejected"} onOpenChange={(open) => { if (!open) cancelPendingMove(); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Mark as Rejected</DialogTitle>
            <DialogDescription>When can we reapply? The opportunity will reappear as "Identified" after that date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reapplication Date *</Label>
              <Input type="date" value={rejectedForm.reapplicationDate} onChange={(e) => setRejectedForm((p) => ({ ...p, reapplicationDate: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Funder Feedback</Label>
              <Textarea placeholder="Any feedback from the funder (optional)" value={rejectedForm.feedback} onChange={(e) => setRejectedForm((p) => ({ ...p, feedback: e.target.value }))} className="rounded-xl" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitRejected} className="rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Funds Received Dialog */}
      <Dialog open={pendingMove?.toStatus === "funds_received"} onOpenChange={(open) => { if (!open) cancelPendingMove(); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Record Funds Received</DialogTitle>
            <DialogDescription>{pendingMove?.opp.funderName} — {pendingMove?.opp.programName}. When did the money land in the bank?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Date Funding Received *</Label>
              <Input type="date" value={fundsReceivedForm.dateFundingReceived} onChange={(e) => setFundsReceivedForm({ dateFundingReceived: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitFundsReceived} className="rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submitted Dialog */}
      <Dialog open={pendingMove?.toStatus === "submitted"} onOpenChange={(open) => { if (!open) cancelPendingMove(); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Mark as Submitted</DialogTitle>
            <DialogDescription>Submission date will be recorded as today. Optionally note when you expect a decision.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Expected Results Date</Label>
              <Input type="date" value={submittedForm.expectedResultsDate} onChange={(e) => setSubmittedForm({ expectedResultsDate: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitSubmitted} className="rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismissed Dialog */}
      <Dialog open={pendingMove?.toStatus === "dismissed"} onOpenChange={(open) => { if (!open) cancelPendingMove(); }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Dismiss Opportunity</DialogTitle>
            <DialogDescription>Dismissed opportunities are kept for reference but excluded from counts and active funding.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason for dismissal *</Label>
              <Textarea placeholder="Why are we dropping this opportunity?" value={dismissedForm.dismissalReason} onChange={(e) => setDismissedForm({ dismissalReason: e.target.value })} className="rounded-xl" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingMove} className="rounded-xl" disabled={submitting}>Cancel</Button>
            <Button onClick={submitDismissed} className="rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pipeline;

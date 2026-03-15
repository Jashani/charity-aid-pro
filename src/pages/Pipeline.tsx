import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GripVertical, Plus, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import {
  mockOpportunities,
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
];

const Pipeline = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>(mockOpportunities);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newOpp, setNewOpp] = useState({
    funderName: "",
    programName: "",
    amount: "",
    deadline: "",
    type: "trust" as FundingOpportunity["type"],
  });

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDrop = (targetStatus: OpportunityStatus) => {
    if (!draggedId) return;
    setOpportunities((prev) =>
      prev.map((o) => (o.id === draggedId ? { ...o, status: targetStatus } : o))
    );
    setDraggedId(null);
    setDragOverCol(null);
  };

  const toggleCollapse = (colId: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      next.has(colId) ? next.delete(colId) : next.add(colId);
      return next;
    });
  };

  const totalValue = (items: FundingOpportunity[]) =>
    items.reduce((s, o) => s + o.amount, 0);

  const handleAddOpportunity = () => {
    if (!newOpp.funderName || !newOpp.programName || !newOpp.amount || !newOpp.deadline) {
      toast.error("Please fill in all fields");
      return;
    }
    const opp: FundingOpportunity = {
      id: `custom-${Date.now()}`,
      funderName: newOpp.funderName,
      programName: newOpp.programName,
      amount: parseInt(newOpp.amount),
      type: newOpp.type,
      deadline: newOpp.deadline,
      location: "UK-wide",
      duration: "single-year",
      durationMonths: 12,
      relationship: "new",
      status: "identified",
      score: 50,
      tags: [],
      description: "",
      eligibility: "",
      notes: "",
      website: "",
      source: "Manual Entry",
    };
    setOpportunities((prev) => [...prev, opp]);
    setShowAddDialog(false);
    setNewOpp({ funderName: "", programName: "", amount: "", deadline: "", type: "trust" });
    toast.success(`"${opp.funderName}" added to pipeline`);
  };

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

        {/* Summary strip */}
        <div className="flex gap-2 flex-wrap">
          {columns.map((col) => {
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
                    {items.length > 0 && (
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
                              <span className="font-semibold">{formatCurrency(opp.amount)}</span>
                              <span className="text-muted-foreground">{daysUntil(opp.deadline)}d left</span>
                            </div>
                            {opp.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pl-6">
                                {opp.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {opp.rejectionFeedback && col.id === "rejected" && (
                              <div className="flex items-start gap-1.5 p-2 bg-destructive/5 rounded-lg text-xs text-muted-foreground ml-6">
                                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{opp.rejectionFeedback}</span>
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
                      {items.length} item{items.length !== 1 ? "s" : ""} · {formatCurrency(totalValue(items))}
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
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Opportunity</DialogTitle>
            <DialogDescription>Add a new funding opportunity to your pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Funder Name</Label>
              <Input
                placeholder="e.g. Arts Council England"
                value={newOpp.funderName}
                onChange={(e) => setNewOpp((p) => ({ ...p, funderName: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Programme Name</Label>
              <Input
                placeholder="e.g. Project Grants"
                value={newOpp.programName}
                onChange={(e) => setNewOpp((p) => ({ ...p, programName: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (£)</Label>
                <Input
                  type="number"
                  placeholder="10000"
                  value={newOpp.amount}
                  onChange={(e) => setNewOpp((p) => ({ ...p, amount: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={newOpp.deadline}
                  onChange={(e) => setNewOpp((p) => ({ ...p, deadline: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newOpp.type} onValueChange={(v) => setNewOpp((p) => ({ ...p, type: v as any }))}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleAddOpportunity} className="rounded-xl">Add to Pipeline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pipeline;

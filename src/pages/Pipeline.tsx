import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Plus, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  formatCurrency,
  daysUntil,
  type FundingOpportunity,
  type OpportunityStatus,
} from "@/lib/mock-data";

const columns: { id: OpportunityStatus; label: string; emoji: string }[] = [
  { id: "identified", label: "Identified", emoji: "🔍" },
  { id: "researching", label: "Researching", emoji: "📖" },
  { id: "applying", label: "Applying", emoji: "✏️" },
  { id: "submitted", label: "Submitted", emoji: "📬" },
  { id: "awarded", label: "Awarded", emoji: "🎉" },
  { id: "rejected", label: "Rejected", emoji: "❌" },
];

const Pipeline = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>(mockOpportunities);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());

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
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const totalValue = (items: FundingOpportunity[]) =>
    items.reduce((s, o) => s + o.amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-muted-foreground mt-1">
              Drag opportunities between stages to track progress.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Add Opportunity
          </Button>
        </div>

        {/* Summary strip */}
        <div className="flex gap-2 flex-wrap">
          {columns.map((col) => {
            const count = opportunities.filter((o) => o.status === col.id).length;
            return (
              <Badge key={col.id} variant="outline" className="text-sm py-1 px-3 gap-1.5">
                {col.emoji} {col.label}: <span className="font-bold">{count}</span>
              </Badge>
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
                className="min-w-[280px] w-[280px] shrink-0 flex flex-col"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.id)}
              >
                {/* Column header */}
                <button
                  onClick={() => toggleCollapse(col.id)}
                  className={`rounded-t-lg px-4 py-3 flex items-center justify-between w-full text-left border border-b-0 border-border bg-card hover:bg-muted/50 transition-colors`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{col.emoji}</span>
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="secondary" className="text-xs h-5 px-1.5 ml-1">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {items.length > 0 && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {formatCurrency(totalValue(items))}
                      </span>
                    )}
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Column body */}
                {!isCollapsed && (
                  <div
                    className={`border border-t-0 border-border rounded-b-lg flex-1 transition-colors ${
                      isDragOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/20"
                    }`}
                  >
                    <ScrollArea className="h-[400px]">
                      <div className="p-2 space-y-2">
                        {items.map((opp) => (
                          <Card
                            key={opp.id}
                            draggable
                            onDragStart={() => handleDragStart(opp.id)}
                            className={`cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                              draggedId === opp.id ? "opacity-40 scale-95" : ""
                            }`}
                          >
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 opacity-40" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold leading-tight">{opp.funderName}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {opp.programName}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-foreground">
                                  {formatCurrency(opp.amount)}
                                </span>
                                <span className="text-muted-foreground">
                                  {daysUntil(opp.deadline)}d left
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {opp.tags.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                              {opp.rejectionFeedback && col.id === "rejected" && (
                                <div className="flex items-start gap-1.5 p-2 bg-destructive/5 rounded text-xs text-muted-foreground">
                                  <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span className="line-clamp-2">{opp.rejectionFeedback}</span>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                        {items.length === 0 && (
                          <div className={`text-center py-12 rounded-lg border-2 border-dashed transition-colors ${
                            isDragOver ? "border-primary/40 bg-primary/5" : "border-muted"
                          }`}>
                            <p className="text-xs text-muted-foreground">
                              {isDragOver ? "Drop here!" : "No items yet"}
                            </p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {isCollapsed && (
                  <div className="border border-t-0 border-border rounded-b-lg bg-muted/10 px-4 py-2">
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
    </DashboardLayout>
  );
};

export default Pipeline;

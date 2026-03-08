import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Plus, MessageSquare } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  formatCurrency,
  daysUntil,
  type FundingOpportunity,
  type OpportunityStatus,
} from "@/lib/mock-data";

const columns: { id: OpportunityStatus; label: string; color: string }[] = [
  { id: "identified", label: "Identified", color: "bg-muted" },
  { id: "researching", label: "Researching", color: "bg-primary/10" },
  { id: "applying", label: "Applying", color: "bg-accent/20" },
  { id: "submitted", label: "Submitted", color: "bg-secondary/10" },
  { id: "awarded", label: "Awarded", color: "bg-success/10" },
  { id: "rejected", label: "Rejected", color: "bg-destructive/10" },
];

const Pipeline = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>(mockOpportunities);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDrop = (targetStatus: OpportunityStatus) => {
    if (!draggedId) return;
    setOpportunities((prev) =>
      prev.map((o) => (o.id === draggedId ? { ...o, status: targetStatus } : o))
    );
    setDraggedId(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-muted-foreground mt-1">
              Drag opportunities between stages to track your application progress.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Add Opportunity
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const items = opportunities.filter((o) => o.status === col.id);
            return (
              <div
                key={col.id}
                className="min-w-[260px] w-[260px] shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.id)}
              >
                <div className={`rounded-t-lg px-3 py-2 ${col.color}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                      {items.length}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 bg-muted/30 rounded-b-lg p-2 min-h-[200px]">
                  {items.map((opp) => (
                    <Card
                      key={opp.id}
                      draggable
                      onDragStart={() => handleDragStart(opp.id)}
                      className={`cursor-grab active:cursor-grabbing transition-all ${
                        draggedId === opp.id ? "opacity-50 scale-95" : ""
                      }`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{opp.funderName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {opp.programName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{formatCurrency(opp.amount)}</span>
                          <span className="text-muted-foreground">
                            {daysUntil(opp.deadline)}d left
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {opp.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">
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
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Drop items here
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;

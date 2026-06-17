import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  SlidersHorizontal,
  Clock,
  ArrowUpDown,
  Zap,
  Globe,
  FileText,
  Loader2,
  XCircle,
  History,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOpportunities } from "@/hooks/useOpportunities";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  formatCurrency,
  daysUntil,
  type FundingOpportunity,
  type OpportunityStatus,
} from "@/lib/mock-data";
import { normalizeFunderName } from "@/hooks/useFunderHistory";

const Discover = () => {
  const queryClient = useQueryClient();
  const { data: allOpportunities = [], isLoading } = useOpportunities();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("score");
  const [amountRange, setAmountRange] = useState([0, 300000]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<FundingOpportunity | null>(null);
  const [showDismissReason, setShowDismissReason] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissSubmitting, setDismissSubmitting] = useState(false);

  const closeDialog = () => {
    setSelectedOpp(null);
    setShowDismissReason(false);
    setDismissReason("");
  };

  const handleDismiss = async () => {
    if (!selectedOpp || !supabase) return;
    setDismissSubmitting(true);
    const { error } = await supabase
      .from("opportunities")
      .update({ status: "dismissed", dismissal_reason: dismissReason || null, updated_at: new Date().toISOString() })
      .eq("id", selectedOpp.id);
    setDismissSubmitting(false);
    if (error) {
      toast.error("Failed to dismiss opportunity");
      return;
    }
    toast.success("Opportunity dismissed");
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    closeDialog();
  };

  const locations = useMemo(
    () => [...new Set(allOpportunities.map((o) => o.location))],
    [allOpportunities]
  );

  const filtered = useMemo(() => {
    let result = allOpportunities.filter((o) => o.status === "identified");

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (o) =>
          o.funderName.toLowerCase().includes(term) ||
          o.programName.toLowerCase().includes(term) ||
          o.description.toLowerCase().includes(term)
      );
    }
    if (typeFilter !== "all") result = result.filter((o) => o.type === typeFilter);
    if (locationFilter !== "all") result = result.filter((o) => o.location === locationFilter);
    result = result.filter((o) => o.amount >= amountRange[0] && (o.amountMax || o.amount) <= amountRange[1]);

    result.sort((a, b) => {
      switch (sortBy) {
        case "score": return b.score - a.score;
        case "amount": return b.amount - a.amount;
        case "deadline": return daysUntil(a.deadline) - daysUntil(b.deadline);
        default: return 0;
      }
    });

    return result;
  }, [allOpportunities, searchTerm, typeFilter, locationFilter, sortBy, amountRange]);

  const getTagStyle = (tag: string) => {
    switch (tag) {
      case "Multi-Year": return "bg-primary/10 text-primary border-primary/20";
      case "Quick Win": return "bg-success/10 text-success border-success/20";
      case "Strong Match": return "bg-accent/20 text-accent-foreground border-accent/30";
      case "High Value": return "bg-secondary/10 text-secondary border-secondary/20";
      case "Capital Cost": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-success";
    if (score >= 70) return "text-primary";
    return "text-muted-foreground";
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
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
            <p className="text-muted-foreground mt-1">Funding opportunities ranked for you.</p>
          </div>
        </div>

        {/* Search */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search funders, programmes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2 rounded-xl"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44 rounded-xl">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Best Match</SelectItem>
                <SelectItem value="amount">Highest Amount</SelectItem>
                <SelectItem value="deadline">Soonest Deadline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFilters && (
            <Card className="rounded-xl">
              <CardContent className="p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="All types" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="grant">Grant</SelectItem>
                        <SelectItem value="trust">Trust</SelectItem>
                        <SelectItem value="lottery">Lottery</SelectItem>
                        <SelectItem value="corporate">Corporate</SelectItem>
                        <SelectItem value="government">Government</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Any location" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any Location</SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Amount: {formatCurrency(amountRange[0])} – {formatCurrency(amountRange[1])}
                  </label>
                  <Slider min={0} max={300000} step={1000} value={amountRange} onValueChange={setAmountRange} className="mt-2" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{filtered.length} opportunities</p>

        <div className="space-y-3">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} getTagStyle={getTagStyle} getScoreColor={getScoreColor} onDetails={() => setSelectedOpp(opp)} />
          ))}
          {filtered.length === 0 && (
            <Card className="rounded-xl">
              <CardContent className="py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No opportunities match your filters.</p>
                <Button variant="ghost" className="mt-2" onClick={() => {
                  setSearchTerm(""); setTypeFilter("all");
                  setLocationFilter("all"); setAmountRange([0, 300000]);
                }}>Clear all filters</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedOpp} onOpenChange={closeDialog}>
        <DialogContent className="rounded-xl max-w-lg">
          {selectedOpp && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedOpp.funderName}</DialogTitle>
                <p className="text-sm text-muted-foreground">{selectedOpp.programName}</p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">{selectedOpp.description}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-bold">{formatAmount(selectedOpp.amount, selectedOpp.amountMax)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Deadline</p>
                    <p className="text-sm font-bold">{formatDeadlineFull(selectedOpp.deadline)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-bold">{selectedOpp.durationMonths} months</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-bold">{selectedOpp.location}</p>
                  </div>
                </div>

                {selectedOpp.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</p>
                    <p className="text-sm">{selectedOpp.notes}</p>
                  </div>
                )}

                {selectedOpp.contactName && (
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Contact</p>
                    <p className="text-sm font-medium">{selectedOpp.contactName}</p>
                    {selectedOpp.contactEmail && <p className="text-xs text-muted-foreground">{selectedOpp.contactEmail}</p>}
                  </div>
                )}

                <FunderHistoryPanel
                  currentOppId={selectedOpp.id}
                  funderName={selectedOpp.funderName}
                  allOpportunities={allOpportunities}
                />

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="rounded-full text-xs">{selectedOpp.type}</Badge>
                  {selectedOpp.tags.map(tag => (
                    <Badge key={tag} variant="outline" className={`rounded-full text-xs ${getTagStyle(tag)}`}>{tag}</Badge>
                  ))}
                </div>

                {selectedOpp.website && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl gap-2"
                    onClick={() => {
                      const url = selectedOpp.website;
                      window.open(/^https?:\/\//i.test(url) ? url : `https://${url}`, "_blank");
                    }}
                  >
                    <Globe className="h-4 w-4" /> Visit Funder Website
                  </Button>
                )}

                <div className="border-t pt-3 space-y-2">
                  {!showDismissReason ? (
                    <Button
                      variant="ghost"
                      className="w-full rounded-xl gap-2 text-muted-foreground hover:text-destructive"
                      onClick={() => setShowDismissReason(true)}
                    >
                      <XCircle className="h-4 w-4" /> Dismiss this opportunity
                    </Button>
                  ) : (
                    <>
                      <Textarea
                        placeholder="Reason for dismissing (optional)"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        className="rounded-xl text-sm resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          className="flex-1 rounded-xl"
                          onClick={handleDismiss}
                          disabled={dismissSubmitting}
                        >
                          {dismissSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Dismiss"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => { setShowDismissReason(false); setDismissReason(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

function oppStatusInfo(status: OpportunityStatus): { label: string; className: string } {
  switch (status) {
    case "awarded":      return { label: "Awarded",        className: "bg-green-100 text-green-800" };
    case "funds_received": return { label: "Funds received", className: "bg-green-100 text-green-800" };
    case "rejected":    return { label: "Rejected",        className: "bg-red-100 text-red-800" };
    case "part_submitted": return { label: "Part Submitted",  className: "bg-blue-100 text-blue-800" };
    case "submitted":      return { label: "Fully Submitted", className: "bg-blue-100 text-blue-800" };
    case "applying":    return { label: "Applying",        className: "bg-yellow-100 text-yellow-800" };
    case "researching": return { label: "Researching",     className: "bg-yellow-100 text-yellow-800" };
    default:            return { label: status,            className: "bg-gray-100 text-gray-500" };
  }
}

function FunderHistoryPanel({
  currentOppId,
  funderName,
  allOpportunities,
}: {
  currentOppId: string;
  funderName: string;
  allOpportunities: FundingOpportunity[];
}) {
  const normalized = normalizeFunderName(funderName);
  const others = allOpportunities
    .filter(
      (o) =>
        o.id !== currentOppId &&
        normalizeFunderName(o.funderName) === normalized &&
        o.status !== "dismissed",
    )
    .sort((a, b) => {
      const da = a.deadline && a.deadline !== "unknown" ? new Date(a.deadline).getTime() : 0;
      const db = b.deadline && b.deadline !== "unknown" ? new Date(b.deadline).getTime() : 0;
      return db - da;
    })
    .slice(0, 3);

  if (others.length === 0) {
    return (
      <div className="rounded-xl bg-muted/40 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          <History className="inline h-3 w-3 mr-1 opacity-60" />
          First time applying to <span className="font-medium">{funderName}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5 space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <History className="h-3 w-3" />
        {others.length} other {others.length === 1 ? "opportunity" : "opportunities"} from this funder
      </p>
      <div className="space-y-1.5">
        {others.map((o) => {
          const { label, className } = oppStatusInfo(o.status);
          return (
            <div key={o.id} className="flex items-center gap-2">
              <span className="text-xs font-medium flex-1 truncate">{o.programName}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${className}`}>
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatCurrency(o.amountAwarded ?? o.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAmount(amount: number, amountMax?: number): string {
  if (amount === 0 && !amountMax) return "Unknown";
  if (amount === 0 && amountMax) return `Up to ${formatCurrency(amountMax)}`;
  if (amountMax && amountMax !== amount) return `${formatCurrency(amount)} – ${formatCurrency(amountMax)}`;
  return formatCurrency(amount);
}

function formatDeadlineFull(deadline: string | undefined): string {
  if (!deadline || deadline === "unknown") return "Unknown";
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function OpportunityCard({
  opportunity: opp,
  getTagStyle,
  getScoreColor,
  onDetails,
}: {
  opportunity: FundingOpportunity;
  getTagStyle: (tag: string) => string;
  getScoreColor: (score: number) => string;
  onDetails: () => void;
}) {
  const isUnknownDeadline = !opp.deadline || opp.deadline === "unknown";
  const days = isUnknownDeadline ? null : daysUntil(opp.deadline);
  const isExpired = days !== null && days < 0;

  return (
    <Card className={`hover:shadow-md transition-shadow rounded-xl cursor-pointer ${isExpired ? "opacity-70" : ""}`} onClick={onDetails}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base">{opp.funderName}</h3>
                {isExpired && (
                  <Badge variant="outline" className="text-xs rounded-full text-destructive border-destructive/40">
                    Deadline passed
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{opp.programName}</p>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{opp.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {opp.tags.map((tag) => (
                <Badge key={tag} variant="outline" className={`text-xs rounded-full ${getTagStyle(tag)}`}>
                  {tag === "Quick Win" && <Zap className="h-3 w-3 mr-0.5" />}
                  {tag}
                </Badge>
              ))}
              <Badge variant="outline" className="text-xs rounded-full">
                {opp.type.charAt(0).toUpperCase() + opp.type.slice(1)}
              </Badge>
            </div>
          </div>

          <div className="text-right shrink-0 space-y-1.5">
            <div className={`text-2xl font-bold ${getScoreColor(opp.score)}`}>{opp.score}</div>
            <p className="text-sm font-semibold">
              {formatAmount(opp.amount, opp.amountMax)}
            </p>
            <div className={`flex items-center gap-1 text-xs justify-end ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              {isUnknownDeadline ? "Unknown deadline" : `${days}d left`}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default Discover;

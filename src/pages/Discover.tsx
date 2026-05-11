import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOpportunities } from "@/hooks/useOpportunities";
import {
  formatCurrency,
  daysUntil,
  type FundingOpportunity,
} from "@/lib/mock-data";

const Discover = () => {
  const { data: allOpportunities = [], isLoading } = useOpportunities();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("score");
  const [amountRange, setAmountRange] = useState([0, 300000]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<FundingOpportunity | null>(null);

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
      <Dialog open={!!selectedOpp} onOpenChange={() => setSelectedOpp(null)}>
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
                    <p className="text-sm font-bold">
                      {formatCurrency(selectedOpp.amount)}
                      {selectedOpp.amountMax && selectedOpp.amountMax !== selectedOpp.amount && ` – ${formatCurrency(selectedOpp.amountMax)}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Deadline</p>
                    <p className="text-sm font-bold">{new Date(selectedOpp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
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

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="rounded-full text-xs">{selectedOpp.type}</Badge>
                  {selectedOpp.tags.map(tag => (
                    <Badge key={tag} variant="outline" className={`rounded-full text-xs ${getTagStyle(tag)}`}>{tag}</Badge>
                  ))}
                </div>

                {selectedOpp.website && (
                  <Button variant="outline" className="w-full rounded-xl gap-2" onClick={() => window.open(selectedOpp.website, "_blank")}>
                    <Globe className="h-4 w-4" /> Visit Funder Website
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

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
  return (
    <Card className="hover:shadow-md transition-shadow rounded-xl cursor-pointer" onClick={onDetails}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base">{opp.funderName}</h3>
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
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Match</p>
            <p className="text-sm font-semibold">
              {formatCurrency(opp.amount)}
              {opp.amountMax && opp.amountMax !== opp.amount && (
                <span className="text-muted-foreground font-normal"> – {formatCurrency(opp.amountMax)}</span>
              )}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
              <Clock className="h-3 w-3" />
              {daysUntil(opp.deadline)}d left
            </div>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default Discover;

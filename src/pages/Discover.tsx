import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  SlidersHorizontal,
  Star,
  Clock,
  ArrowUpDown,
  ExternalLink,
  RefreshCw,
  Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  mockOpportunities,
  formatCurrency,
  daysUntil,
  getRelationshipLabel,
  type FundingOpportunity,
} from "@/lib/mock-data";

const Discover = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [durationFilter, setDurationFilter] = useState<string>("all");
  const [relationshipFilter, setRelationshipFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("score");
  const [amountRange, setAmountRange] = useState([0, 300000]);
  const [showFilters, setShowFilters] = useState(false);

  const locations = useMemo(
    () => [...new Set(mockOpportunities.map((o) => o.location))],
    []
  );

  const filtered = useMemo(() => {
    let result = mockOpportunities.filter(
      (o) => o.status !== "awarded" && o.status !== "rejected"
    );

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
    if (durationFilter !== "all") result = result.filter((o) => o.duration === durationFilter);
    if (relationshipFilter !== "all") result = result.filter((o) => o.relationship === relationshipFilter);
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
  }, [searchTerm, typeFilter, durationFilter, relationshipFilter, locationFilter, sortBy, amountRange]);

  const getTagStyle = (tag: string) => {
    switch (tag) {
      case "Multi-Year": return "bg-primary/10 text-primary border-primary/20";
      case "Quick Win": return "bg-success/10 text-success border-success/20";
      case "Previously Applied": return "bg-accent/20 text-accent-foreground border-accent/30";
      case "Re-eligible": return "bg-secondary/10 text-secondary border-secondary/20";
      case "Capital Cost": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-success";
    if (score >= 70) return "text-accent-foreground";
    return "text-muted-foreground";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discover Opportunities</h1>
            <p className="text-muted-foreground mt-1">
              Automatically discovered funding opportunities, ranked for you.
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Scan Now
          </Button>
        </div>

        {/* Search and Filter Bar */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search funders, programmes, keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44">
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
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Funding Type
                    </label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
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
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Duration
                    </label>
                    <Select value={durationFilter} onValueChange={setDurationFilter}>
                      <SelectTrigger><SelectValue placeholder="Any duration" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any Duration</SelectItem>
                        <SelectItem value="single-year">Single Year</SelectItem>
                        <SelectItem value="multi-year">Multi-Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Relationship
                    </label>
                    <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
                      <SelectTrigger><SelectValue placeholder="Any relationship" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any Relationship</SelectItem>
                        <SelectItem value="existing-funder">Existing Funder</SelectItem>
                        <SelectItem value="previously-applied">Previously Applied</SelectItem>
                        <SelectItem value="re-eligible">Re-eligible</SelectItem>
                        <SelectItem value="new">New Funder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Location
                    </label>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger><SelectValue placeholder="Any location" /></SelectTrigger>
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
                    Amount Range: {formatCurrency(amountRange[0])} – {formatCurrency(amountRange[1])}
                  </label>
                  <Slider
                    min={0}
                    max={300000}
                    step={1000}
                    value={amountRange}
                    onValueChange={setAmountRange}
                    className="mt-2"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{filtered.length} opportunities found</p>
        </div>

        <div className="space-y-3">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} getTagStyle={getTagStyle} getScoreColor={getScoreColor} />
          ))}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No opportunities match your filters.</p>
                <Button variant="ghost" className="mt-2" onClick={() => {
                  setSearchTerm("");
                  setTypeFilter("all");
                  setDurationFilter("all");
                  setRelationshipFilter("all");
                  setLocationFilter("all");
                  setAmountRange([0, 300000]);
                }}>
                  Clear all filters
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

function OpportunityCard({
  opportunity: opp,
  getTagStyle,
  getScoreColor,
}: {
  opportunity: FundingOpportunity;
  getTagStyle: (tag: string) => string;
  getScoreColor: (score: number) => string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base">{opp.funderName}</h3>
                  {opp.relationship === "existing-funder" && (
                    <Star className="h-4 w-4 text-accent fill-accent" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{opp.programName}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2">{opp.description}</p>

            <div className="flex flex-wrap gap-1.5">
              {opp.tags.map((tag) => (
                <Badge key={tag} variant="outline" className={`text-xs ${getTagStyle(tag)}`}>
                  {tag === "Quick Win" && <Zap className="h-3 w-3 mr-0.5" />}
                  {tag}
                </Badge>
              ))}
              <Badge variant="outline" className="text-xs">
                {opp.type.charAt(0).toUpperCase() + opp.type.slice(1)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {getRelationshipLabel(opp.relationship)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {opp.location}
              </Badge>
            </div>
          </div>

          <div className="text-right shrink-0 space-y-1.5">
            <div className={`text-2xl font-bold ${getScoreColor(opp.score)}`}>
              {opp.score}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Match</p>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                {formatCurrency(opp.amount)}
                {opp.amountMax && opp.amountMax !== opp.amount && (
                  <span className="text-muted-foreground font-normal"> – {formatCurrency(opp.amountMax)}</span>
                )}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                <Clock className="h-3 w-3" />
                {daysUntil(opp.deadline)} days left
              </div>
              <p className="text-xs text-muted-foreground">{opp.durationMonths} months</p>
            </div>
            <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs gap-1">
              <ExternalLink className="h-3 w-3" /> Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default Discover;

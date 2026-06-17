import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Users,
  TrendingUp,
  Award,
  Mail,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useFunderHistory, type FunderRecord } from "@/hooks/useFunderHistory";
import { useUpsertFunderContact } from "@/hooks/useUpsertFunderContact";
import { formatCurrency, type OpportunityStatus } from "@/lib/mock-data";
import { toast } from "sonner";

type SortKey = "awarded" | "recent" | "alpha";

function relativeDate(dateStr: string): string {
  if (!dateStr || dateStr === "unknown") return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 0) return `in ${Math.abs(days)}d`;
  if (days === 0) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function statusInfo(status: OpportunityStatus): { label: string; className: string } {
  switch (status) {
    case "awarded":
      return { label: "Awarded", className: "bg-green-100 text-green-800" };
    case "funds_received":
      return { label: "Funds received", className: "bg-green-100 text-green-800" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-100 text-red-800" };
    case "part_submitted":
      return { label: "Part Submitted", className: "bg-blue-100 text-blue-800" };
    case "submitted":
      return { label: "Fully Submitted", className: "bg-blue-100 text-blue-800" };
    case "applying":
      return { label: "Applying", className: "bg-yellow-100 text-yellow-800" };
    case "researching":
      return { label: "Researching", className: "bg-yellow-100 text-yellow-800" };
    case "dismissed":
      return { label: "Dismissed", className: "bg-gray-100 text-gray-500" };
    case "on_hold":
      return { label: "On hold", className: "bg-gray-100 text-gray-500" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-500" };
  }
}

function FunderHistoryDialog({
  funder,
  onClose,
}: {
  funder: FunderRecord | null;
  onClose: () => void;
}) {
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const upsert = useUpsertFunderContact();

  const open = !!funder;

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setShowContactForm(false);
      setContactName("");
      setContactEmail("");
      setContactNotes("");
    }
  };

  const handleOpenForm = () => {
    if (funder?.contact) {
      setContactName(funder.contact.name);
      setContactEmail(funder.contact.email);
      setContactNotes(funder.contact.notes);
    }
    setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    if (!funder) return;
    try {
      await upsert.mutateAsync({
        organisation: funder.displayName,
        name: contactName,
        email: contactEmail,
        notes: contactNotes,
      });
      toast.success("Contact saved");
      setShowContactForm(false);
    } catch {
      toast.error("Failed to save contact");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="rounded-xl max-w-lg max-h-[80vh] overflow-y-auto">
        {funder && (
          <>
            <DialogHeader>
              <DialogTitle>{funder.displayName}</DialogTitle>
              {funder.contact && (
                <p className="text-sm text-muted-foreground">
                  {funder.contact.name}
                  {funder.contact.email && (
                    <> · <span className="font-mono text-xs">{funder.contact.email}</span></>
                  )}
                </p>
              )}
            </DialogHeader>

            {/* Summary stats */}
            <div className="flex gap-3 py-1">
              <div className="flex-1 rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold">{funder.totalApplications}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Applications</p>
              </div>
              <div className="flex-1 rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold">
                  {funder.awardedCount}/{funder.totalApplications}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Awarded</p>
              </div>
              <div className="flex-1 rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold">
                  {funder.totalAwarded > 0 ? formatCurrency(funder.totalAwarded) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total awarded</p>
              </div>
            </div>

            {funder.contact?.notes && (
              <p className="text-sm text-muted-foreground rounded-xl bg-muted/30 p-3">
                {funder.contact.notes}
              </p>
            )}

            {/* Opportunity list */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                History
              </p>
              {funder.opportunities.map((opp) => {
                const { label, className } = statusInfo(opp.status);
                return (
                  <div
                    key={opp.id}
                    className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{opp.programName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {opp.deadline && opp.deadline !== "unknown"
                          ? new Date(opp.deadline).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "No deadline"}
                      </p>
                    </div>
                    <Badge className={`text-[10px] font-medium shrink-0 ${className}`}>
                      {label}
                    </Badge>
                    <span className="text-xs font-semibold shrink-0">
                      {formatCurrency(opp.amountAwarded ?? opp.amount)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Contact form */}
            <div className="border-t pt-3">
              {!showContactForm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1 text-muted-foreground text-xs rounded-xl"
                  onClick={handleOpenForm}
                >
                  {funder.contact ? (
                    <>
                      <ChevronDown className="h-3 w-3" /> Edit contact details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" /> Add contact details
                    </>
                  )}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Contact details</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowContactForm(false)}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Contact name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                  <Input
                    placeholder="Email address"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                  <Textarea
                    placeholder="Notes (e.g. met at conference, responsive to calls)"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    className="rounded-xl text-sm resize-none"
                    rows={2}
                  />
                  <Button
                    size="sm"
                    className="w-full rounded-xl"
                    onClick={handleSaveContact}
                    disabled={upsert.isPending}
                  >
                    {upsert.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Save contact"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Relationships = () => {
  const { data: funderRecords, isLoading } = useFunderHistory();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("awarded");
  const [selectedFunder, setSelectedFunder] = useState<FunderRecord | null>(null);

  const filtered = useMemo(() => {
    let result = funderRecords;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((f) => f.displayName.toLowerCase().includes(term));
    }
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "awarded":
          return b.awardedCount - a.awardedCount || b.totalAwarded - a.totalAwarded;
        case "recent": {
          const da = a.lastActivityDate && a.lastActivityDate !== "unknown"
            ? new Date(a.lastActivityDate).getTime() : 0;
          const db = b.lastActivityDate && b.lastActivityDate !== "unknown"
            ? new Date(b.lastActivityDate).getTime() : 0;
          return db - da;
        }
        case "alpha":
          return a.displayName.localeCompare(b.displayName);
      }
    });
  }, [funderRecords, searchTerm, sortBy]);

  const totalFunders = funderRecords.length;
  const fundersWithAward = funderRecords.filter((f) => f.awardedCount > 0).length;
  const totalAwarded = funderRecords.reduce((s, f) => s + f.totalAwarded, 0);

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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relationships</h1>
          <p className="text-muted-foreground mt-1">Funders you have engaged with.</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Funders engaged", value: totalFunders, icon: Users, color: "text-primary" },
            { label: "Awarded at least once", value: fundersWithAward, icon: Award, color: "text-green-600" },
            { label: "Total awarded", value: formatCurrency(totalAwarded), icon: TrendingUp, color: "text-secondary" },
          ].map((s) => (
            <Card key={s.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {s.label}
                  </span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search funders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-44 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="awarded">Most awarded</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="alpha">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Funder cards */}
        {filtered.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {searchTerm ? "No funders match your search." : "No funder history yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((funder) => {
              const awardRate =
                funder.totalApplications > 0
                  ? funder.awardedCount / funder.totalApplications
                  : 0;

              return (
                <Card
                  key={funder.normalizedName}
                  className="hover:shadow-md transition-shadow rounded-xl"
                >
                  <CardContent className="p-5 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base leading-tight">
                          {funder.displayName}
                        </h3>
                        {funder.contact ? (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{funder.contact.name} · {funder.contact.email}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 mt-0.5">No contact added</p>
                        )}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        {funder.totalApplications} {funder.totalApplications === 1 ? "application" : "applications"}
                      </span>
                    </div>

                    {/* Award stats */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {funder.awardedCount} of {funder.totalApplications} awarded
                      </span>
                      {funder.totalAwarded > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {formatCurrency(funder.totalAwarded)}
                        </span>
                      )}
                    </div>

                    {/* Award rate bar */}
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${awardRate * 100}%` }}
                      />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Last activity: {relativeDate(funder.lastActivityDate)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-xl"
                        onClick={() => setSelectedFunder(funder)}
                      >
                        View history
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <FunderHistoryDialog
        funder={selectedFunder}
        onClose={() => setSelectedFunder(null)}
      />
    </DashboardLayout>
  );
};

export default Relationships;

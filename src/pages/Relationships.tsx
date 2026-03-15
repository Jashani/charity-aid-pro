import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Star,
  Mail,
  Phone,
  ExternalLink,
  Users,
  TrendingUp,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { mockFunderContacts, formatCurrency, type FunderContact } from "@/lib/mock-data";

// Mock interaction history per contact
const mockHistory: Record<string, { date: string; type: string; note: string }[]> = {
  fc1: [
    { date: "2026-01-15", type: "Meeting", note: "Discussed new project proposal for community workshops" },
    { date: "2025-09-20", type: "Email", note: "Submitted final grant report — positive feedback received" },
    { date: "2025-04-01", type: "Award", note: "£12,000 grant awarded for National Lottery Project" },
    { date: "2025-03-01", type: "Application", note: "Application submitted for Project Grants 2025" },
  ],
  fc2: [
    { date: "2024-12-01", type: "Email", note: "Received rejection feedback — encouraged to reapply with stronger evidence" },
    { date: "2024-09-15", type: "Application", note: "Application submitted for Reaching Communities" },
  ],
  fc3: [
    { date: "2026-02-10", type: "Event", note: "Attended Youth Music networking event — introduced to new contacts" },
    { date: "2025-06-01", type: "Award", note: "£8,500 Incubator Fund grant awarded" },
    { date: "2025-01-10", type: "Application", note: "Application submitted for Incubator Fund" },
  ],
  fc4: [
    { date: "2026-02-20", type: "Application", note: "New application submitted — awaiting decision" },
    { date: "2025-01-01", type: "Award", note: "£25,000 Main Grants Programme awarded (2-year)" },
  ],
  fc5: [
    { date: "2025-11-20", type: "Call", note: "Progress check-in call — project on track, positive feedback" },
    { date: "2024-04-01", type: "Award", note: "£45,000 Main Grants awarded (3-year programme)" },
  ],
};

const typeIcons: Record<string, React.ReactNode> = {
  Meeting: <Users className="h-3.5 w-3.5 text-primary" />,
  Email: <Mail className="h-3.5 w-3.5 text-muted-foreground" />,
  Award: <CheckCircle className="h-3.5 w-3.5 text-success" />,
  Application: <Clock className="h-3.5 w-3.5 text-warning" />,
  Event: <Calendar className="h-3.5 w-3.5 text-secondary" />,
  Call: <Phone className="h-3.5 w-3.5 text-primary" />,
  Rejection: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const Relationships = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContact, setSelectedContact] = useState<FunderContact | null>(null);

  const filtered = searchTerm
    ? mockFunderContacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.organisation.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : mockFunderContacts;

  const sortedContacts = [...filtered].sort((a, b) => b.relationshipScore - a.relationshipScore);

  const totalFunded = mockFunderContacts.reduce((s, c) => s + c.totalFunded, 0);
  const avgSuccess = Math.round(
    mockFunderContacts.reduce((s, c) => s + c.successRate, 0) / mockFunderContacts.length
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relationships</h1>
          <p className="text-muted-foreground mt-1">Your funder contacts and history.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Contacts", value: mockFunderContacts.length, icon: Users, color: "text-primary" },
            { label: "Total Funded", value: formatCurrency(totalFunded), icon: TrendingUp, color: "text-secondary" },
            { label: "Avg Success", value: `${avgSuccess}%`, icon: Star, color: "text-accent" },
          ].map((s) => (
            <Card key={s.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sortedContacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow rounded-xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{contact.name}</h3>
                    <p className="text-sm text-muted-foreground">{contact.role}</p>
                    <p className="text-sm font-medium text-primary">{contact.organisation}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-primary">{contact.relationshipScore}</span>
                    <span className="text-xs text-muted-foreground">/10</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {contact.email}</span>
                  {contact.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {contact.phone}</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Funded", value: formatCurrency(contact.totalFunded) },
                    { label: "Applications", value: contact.applicationsCount },
                    { label: "Success", value: `${contact.successRate}%` },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-muted/50 p-2.5">
                      <p className="text-sm font-bold">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <Progress
                  value={contact.relationshipScore * 10}
                  className="h-1 [&>div]:bg-primary"
                />

                <p className="text-xs text-muted-foreground">{contact.notes}</p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Last contact:{" "}
                    {new Date(contact.lastContact).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectedContact(contact)}>
                    <ExternalLink className="h-3 w-3" /> History
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={!!selectedContact} onOpenChange={() => setSelectedContact(null)}>
        <DialogContent className="rounded-xl max-w-md">
          {selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedContact.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{selectedContact.role} · {selectedContact.organisation}</p>
              </DialogHeader>
              <div className="space-y-1 py-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Interaction History</p>
                <div className="space-y-3">
                  {(mockHistory[selectedContact.id] || []).map((entry, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="mt-0.5 shrink-0">{typeIcons[entry.type] || <Clock className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{entry.type}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                      </div>
                    </div>
                  ))}
                  {!(mockHistory[selectedContact.id]?.length) && (
                    <p className="text-xs text-muted-foreground text-center py-4">No history recorded yet.</p>
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

export default Relationships;

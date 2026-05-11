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
  Search, Star, Mail, Phone, ExternalLink, Users, TrendingUp, Calendar, CheckCircle, XCircle, Clock, Loader2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useFunderContacts } from "@/hooks/useFunderContacts";
import { formatCurrency, type FunderContact } from "@/lib/mock-data";


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
  const { data: allContacts = [], isLoading } = useFunderContacts();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContact, setSelectedContact] = useState<FunderContact | null>(null);

  const filtered = searchTerm
    ? allContacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.organisation.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allContacts;

  const sortedContacts = [...filtered].sort((a, b) => b.relationshipScore - a.relationshipScore);

  const totalFunded = allContacts.reduce((s, c) => s + c.totalFunded, 0);
  const avgSuccess = allContacts.length > 0 ? Math.round(
    allContacts.reduce((s, c) => s + c.successRate, 0) / allContacts.length
  ) : 0;

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
          <p className="text-muted-foreground mt-1">Your funder contacts and history.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Contacts", value: allContacts.length, icon: Users, color: "text-primary" },
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
                  <p className="text-xs text-muted-foreground text-center py-4">No history recorded yet.</p>
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

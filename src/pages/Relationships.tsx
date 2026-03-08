import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Star,
  Mail,
  Phone,
  ExternalLink,
  Users,
  TrendingUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { mockFunderContacts, formatCurrency } from "@/lib/mock-data";

const Relationships = () => {
  const [searchTerm, setSearchTerm] = useState("");

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
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funder Relationships</h1>
          <p className="text-muted-foreground mt-1">
            Manage your key funder contacts and relationship history.
          </p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Contacts</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{mockFunderContacts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Funded</CardTitle>
              <TrendingUp className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totalFunded)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Success Rate</CardTitle>
              <Star className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{avgSuccess}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Contact Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {sortedContacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{contact.name}</h3>
                    <p className="text-sm text-muted-foreground">{contact.role}</p>
                    <p className="text-sm font-medium text-primary">{contact.organisation}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3 w-3 ${
                          i < contact.relationshipScore
                            ? "text-accent fill-accent"
                            : "text-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {contact.email}
                  </span>
                  {contact.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {contact.phone}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{formatCurrency(contact.totalFunded)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Funded</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{contact.applicationsCount}</p>
                    <p className="text-[10px] text-muted-foreground">Applications</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{contact.successRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Success</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Relationship strength</span>
                    <span className="font-medium">{contact.relationshipScore}/10</span>
                  </div>
                  <Progress
                    value={contact.relationshipScore * 10}
                    className="h-1.5 [&>div]:bg-primary"
                  />
                </div>

                <p className="text-xs text-muted-foreground italic">{contact.notes}</p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Last contact:{" "}
                    {new Date(contact.lastContact).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" /> View History
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Relationships;

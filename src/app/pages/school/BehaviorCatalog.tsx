// Principal-only page for managing the school-wide behavior catalog.
//
// Lives at /school/orgs/:orgId/behavior-catalog. Lists positives + concerns
// separately. "Add behavior" dialog covers both kinds. Inactive items
// hidden by default with a toggle to show them (since the backend GET
// already filters to active=true, "show inactive" would need a separate
// endpoint — deferred; for v1 we just show what's active).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ChevronLeft, Plus, Heart, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createBehaviorCatalogItem,
  getBehaviorCatalog,
  type BehaviorCatalogItem,
} from "../../../utils/schoolApi";

// Sensible defaults the principal can override — based on what most
// Pakistani schools already use informally.
const POSITIVE_DEFAULTS = [
  { name: "Helped a classmate", points: 3 },
  { name: "Volunteered in class", points: 2 },
  { name: "Came prepared", points: 2 },
  { name: "Showed good adab", points: 3 },
];
const NEGATIVE_DEFAULTS = [
  { name: "Disrupting class", points: -3, tier: "minor" as const },
  { name: "Not completing homework", points: -2, tier: "minor" as const },
  { name: "Disrespectful behavior", points: -5, tier: "moderate" as const },
];

export function BehaviorCatalog() {
  const { orgId = "" } = useParams();
  const [items, setItems] = useState<BehaviorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"positive" | "negative">("positive");
  const [points, setPoints] = useState("3");
  const [tier, setTier] = useState<"minor" | "moderate" | "major">("minor");
  const [dedupeMinutes, setDedupeMinutes] = useState("15");
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await getBehaviorCatalog(orgId);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Could not load catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const resetForm = (newKind?: "positive" | "negative") => {
    setName("");
    setKind(newKind ?? "positive");
    setPoints(newKind === "negative" ? "3" : "3");
    setTier("minor");
    setDedupeMinutes("15");
  };

  const submitAdd = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    const pts = parseInt(points, 10);
    if (Number.isNaN(pts) || pts <= 0) {
      toast.error("Points must be a positive number — the sign is set by kind");
      return;
    }
    setSubmitting(true);
    try {
      await createBehaviorCatalogItem(orgId, {
        name: name.trim(),
        kind,
        points: pts, // backend auto-negates for kind=negative
        tier: kind === "negative" ? tier : undefined,
        dedupeWindowMin: kind === "negative" ? parseInt(dedupeMinutes, 10) : undefined,
      });
      toast.success(`"${name}" added to catalog`);
      setAddOpen(false);
      resetForm();
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not add behavior");
    } finally {
      setSubmitting(false);
    }
  };

  const seedDefaults = async () => {
    setSubmitting(true);
    try {
      for (const item of POSITIVE_DEFAULTS) {
        await createBehaviorCatalogItem(orgId, { name: item.name, kind: "positive", points: item.points });
      }
      for (const item of NEGATIVE_DEFAULTS) {
        await createBehaviorCatalogItem(orgId, {
          name: item.name, kind: "negative", points: Math.abs(item.points), tier: item.tier, dedupeWindowMin: 15,
        });
      }
      toast.success("Default catalog seeded — edit as you like");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not seed defaults");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  if (error) {
    return <div className="max-w-lg mx-auto mt-12 text-red-600">Error: {error}</div>;
  }

  const positives = items.filter((i) => i.kind === "positive");
  const negatives = items.filter((i) => i.kind === "negative");

  return (
    <div className="space-y-6">
      <Link to={`/school/orgs/${orgId}`} className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" />
        Back to dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Behavior catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            School-wide list of behaviors teachers can log. You're the only one who can edit this — teachers pick from it.
          </p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button onClick={seedDefaults} variant="outline" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Seed defaults
            </Button>
          )}
          <Button onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add behavior
          </Button>
        </div>
      </div>

      {items.length === 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900 text-base">No behaviors yet</CardTitle>
            <CardDescription className="text-amber-800">
              Teachers can't log behaviors until at least one is in the catalog.
              Seed defaults to get started fast, or add custom items.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Positive */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-green-600" />
            Positive ({positives.length})
          </CardTitle>
          <CardDescription>
            Things teachers can recognize. Default points apply on each log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positives.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No positive behaviors yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {positives.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 border rounded-lg">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 font-mono">+{item.points}</Badge>
                  <span className="text-sm font-medium flex-1 truncate">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Negative */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Concerns ({negatives.length})
          </CardTitle>
          <CardDescription>
            Use sparingly — the audit trail records every entry. Dedupe window prevents accidental repeat-taps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {negatives.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No concerns yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {negatives.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 border rounded-lg">
                  <Badge variant="secondary" className="bg-red-100 text-red-800 font-mono">{item.points}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.tier && <span className="capitalize mr-2">{item.tier}</span>}
                      {item.dedupe_window_min !== null && <span>· {item.dedupe_window_min}m guard</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a behavior</DialogTitle>
            <DialogDescription>Will appear in the teacher's "Log behavior" dialog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive (rewards points)</SelectItem>
                  <SelectItem value="negative">Concern (deducts points)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-name">Name</Label>
              <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "positive" ? "Helped a classmate" : "Disrupting class"} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-points">
                Points {kind === "negative" && <span className="text-muted-foreground">(stored negative; just enter the magnitude)</span>}
              </Label>
              <Input id="b-points" type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
            {kind === "negative" && (
              <>
                <div className="space-y-1">
                  <Label>Severity</Label>
                  <Select value={tier} onValueChange={(v: any) => setTier(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b-dedupe">Dedupe window (minutes)</Label>
                  <Input id="b-dedupe" type="number" min="0" value={dedupeMinutes} onChange={(e) => setDedupeMinutes(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Blocks repeat logs within this window. 15 is sensible — set 0 to disable.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={submitting || !name.trim()}>
              {submitting ? "Adding…" : "Add to catalog"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

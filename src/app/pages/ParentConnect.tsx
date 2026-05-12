// /parent/connect?code=XXXXXXXX
//
// Where the SMS/WhatsApp invite link lands. The parent already has a
// Supabase auth session (gated by ProtectedRoute), so this page just
// resolves the code and offers the two claim modes:
//
//   - Merge into existing family — picks up child into the family the
//     parent already operates on the family product.
//   - Adopt as new family — used when the parent is brand new. The
//     virtual school-pending family becomes theirs (renamed, parent
//     added as owner).
//
// After successful claim, we drop the parent at the family dashboard
// where they can see the child immediately.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  AlertCircle, CheckCircle2, Loader2, School, GraduationCap, Heart, ArrowRight, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { acceptParentInvite, previewParentInvite } from "../../utils/schoolApi";
import { getStorage, STORAGE_KEYS } from "../../utils/storage";
import { useFamilyContext } from "../contexts/FamilyContext";

interface InvitePreview {
  inviteCode: string;
  child: { id: string; name: string; avatar: string | null };
  class?: {
    id: string;
    name: string;
    organization_id: string;
    organizations?: { id: string; name: string };
  };
  expiresAt: string | null;
}

export function ParentConnect() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // FamilyContext lets us list the parent's KV kids so they can say
  // "this school student is my existing Ahmad". The selected KV id is
  // sent as linkToKvChildId on accept, which the backend writes to
  // child_id_map so the family Dashboard can later show school events
  // alongside home events for the same child.
  const { children: kvChildren } = useFamilyContext();

  const initialCode = params.get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState<boolean>(!!initialCode);
  const [error, setError] = useState<string | null>(null);

  // Family the caller already operates on (from local storage cache)
  const [existingFamilyId, setExistingFamilyId] = useState<string | null>(null);

  // Optional KV child to link (only shown in merge mode and when the
  // parent has existing KV kids).
  const [linkToKvChildId, setLinkToKvChildId] = useState<string>("");

  // Claim state
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    getStorage(STORAGE_KEYS.FAMILY_ID).then((id) => setExistingFamilyId(id ?? null));
  }, []);

  // Auto-select the KV child whose name matches the school child, when
  // there's exactly one match — saves the parent a tap in the common case.
  useEffect(() => {
    if (!preview || kvChildren.length === 0) return;
    const matches = kvChildren.filter(
      (c) => c.name.trim().toLowerCase() === preview.child.name.trim().toLowerCase(),
    );
    if (matches.length === 1) setLinkToKvChildId(matches[0].id);
  }, [preview, kvChildren]);

  // Load preview when code is present in URL
  useEffect(() => {
    if (!initialCode) return;
    setLoading(true);
    setError(null);
    previewParentInvite(initialCode)
      .then((p) => setPreview(p as InvitePreview))
      .catch((e) => {
        const msg = e?.message || "Invite not found";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [initialCode]);

  const lookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const p = await previewParentInvite(code.trim());
      setPreview(p as InvitePreview);
      setParams({ code: code.trim() }, { replace: true });
    } catch (e: any) {
      setError(e?.message || "Invite not found");
    } finally {
      setLoading(false);
    }
  };

  const submitClaim = async (mode: "merge" | "adopt") => {
    if (!preview) return;
    setClaiming(true);
    try {
      const body: any = {};
      if (mode === "merge" && existingFamilyId) {
        body.mergeIntoFamilyId = existingFamilyId;
        if (linkToKvChildId) body.linkToKvChildId = linkToKvChildId;
      }
      await acceptParentInvite(preview.inviteCode, body);
      setClaimed(true);
      toast.success(
        mode === "merge"
          ? `${preview.child.name} added to your family`
          : `Family created with ${preview.child.name}`,
      );
      // Pause briefly so the success state is visible, then route home
      setTimeout(() => navigate("/"), 1500);
    } catch (e: any) {
      toast.error(e?.message || "Could not claim invite");
    } finally {
      setClaiming(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  if (claimed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-50">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Connected!</CardTitle>
            <CardDescription>Redirecting you to your dashboard…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <School className="h-10 w-10 text-blue-600 mx-auto" />
          <h1 className="text-2xl font-bold mt-2">Connect to your child's school</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the invite code the school sent you to link your child's school account to your family.
          </p>
        </div>

        {/* Code entry — shown when no preview yet */}
        {!preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter invite code</CardTitle>
              <CardDescription>
                8 characters · case-sensitive · check the WhatsApp/SMS from the school.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. Ab3xKp9Q"
                  className="font-mono tracking-wider text-center text-lg"
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <Button onClick={lookup} disabled={loading || !code.trim()} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Look up invite
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Preview + claim */}
        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">You're connecting:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-3xl">{preview.child.avatar || "👤"}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-900">{preview.child.name}</p>
                  {preview.class && (
                    <p className="text-xs text-blue-700 mt-0.5">
                      {preview.class.organizations?.name ?? "School"} · {preview.class.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Two paths: merge into existing family or adopt */}
              {existingFamilyId ? (
                <div className="space-y-3">
                  <div className="border rounded-lg p-3 bg-white">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Heart className="h-4 w-4 text-pink-500" />
                      Add to your existing family
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {preview.child.name} will appear alongside your other children. Your existing family settings and history stay intact.
                    </p>

                    {/* Link to one of the parent's existing KV kids so the
                        family Dashboard can show school events alongside
                        home events for the same child. Shown only when the
                        parent has at least one existing kid. */}
                    {kvChildren.length > 0 && (
                      <div className="mt-3 space-y-1.5 p-2.5 rounded-md bg-indigo-50/60 border border-indigo-100">
                        <Label className="text-xs flex items-center gap-1.5 text-indigo-900">
                          <Link2 className="h-3.5 w-3.5" />
                          Is this the same child as one of yours?
                        </Label>
                        <Select value={linkToKvChildId} onValueChange={setLinkToKvChildId}>
                          <SelectTrigger className="h-8 text-sm bg-white">
                            <SelectValue placeholder="Pick a child (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No — keep them separate</SelectItem>
                            {kvChildren.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.avatar || "👤"} {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-indigo-700/80">
                          Linking lets you see {preview.child.name}'s school activity (Salah, sabaq, behavior) in your family timeline.
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={() => submitClaim("merge")}
                      disabled={claiming}
                      className="w-full mt-3"
                    >
                      {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Add to my family <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Or create a separate family for {preview.child.name}
                    </summary>
                    <div className="mt-2 border rounded-lg p-3 bg-gray-50">
                      <p className="text-muted-foreground">
                        Not common — only use this if you don't want this child's record mixed with your other family's.
                      </p>
                      <Button
                        onClick={() => submitClaim("adopt")}
                        disabled={claiming}
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                      >
                        Create separate family
                      </Button>
                    </div>
                  </details>
                </div>
              ) : (
                <Button
                  onClick={() => submitClaim("adopt")}
                  disabled={claiming}
                  className="w-full"
                >
                  {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Connect & start
                </Button>
              )}

              {preview.expiresAt && (
                <p className="text-xs text-muted-foreground text-center">
                  This code expires on{" "}
                  <Badge variant="secondary">
                    {new Date(preview.expiresAt).toLocaleDateString()}
                  </Badge>
                </p>
              )}

              <button
                onClick={() => { setPreview(null); setCode(""); setParams({}, { replace: true }); }}
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
              >
                Use a different code
              </button>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Need help? Ask the teacher who shared this code.{" "}
          <Link to="/" className="text-blue-600 hover:underline">Skip for now</Link>
        </p>
      </div>
    </div>
  );
}

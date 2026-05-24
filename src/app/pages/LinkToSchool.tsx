// Family-side "Link to school" flow.
//
// Two steps:
//   1. Parent picks one of their existing family children (from FamilyContext).
//   2. Parent enters the 8-character code their school gave them.
// On submit we consume the code, then write the KV↔Postgres mapping so the
// family Dashboard's school-events fetch (getKvChildSchoolEvents) starts
// returning data for that child.
//
// Errors from the backend ("code not found", "code expired", "code already
// used") are surfaced verbatim — they're already user-readable.

import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Alert, AlertDescription } from "../components/ui/alert";
import { CheckCircle2, GraduationCap, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useFamilyContext } from "../contexts/FamilyContext";
import { consumeLinkCode, bindFamilyChildToStudent } from "../../utils/schoolApi";

interface SuccessState {
  childName: string;
  studentName: string;
  orgId: string;
}

export function LinkToSchool() {
  const navigate = useNavigate();
  const { children } = useFamilyContext();

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? null;

  // Codes use letters and digits, no zero, no letter O.
  const sanitizeCode = (raw: string) =>
    raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O0]/g, "");

  const canSubmit = !!selectedChildId && code.length >= 4 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedChild) return;
    setSubmitting(true);
    try {
      const { studentId, orgId, studentName } = await consumeLinkCode(code);
      // If the bind fails after the code is already consumed, the code can't
      // be reused. Surface the bind error explicitly so the parent (or
      // support) can manually recover via the audit log.
      await bindFamilyChildToStudent({
        kvChildId: selectedChild.id,
        studentId,
        orgId,
      });
      setSuccess({ childName: selectedChild.name, studentName, orgId });
    } catch (err: any) {
      const msg = err?.message || "Could not link to school. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto space-y-4" data-testid="page-link-to-school-success">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle>Linked successfully</CardTitle>
                <CardDescription>
                  {success.childName} is now linked to {success.studentName}.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30">
              <AlertDescription className="text-sm">
                School-logged events (hifz, salah, behavior, attendance) will
                now appear on {success.childName}'s family timeline. You can
                switch to the school workspace from the header to see their
                class-level view.
              </AlertDescription>
            </Alert>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => navigate("/")} className="flex-1">
                Back to dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(null);
                  setCode("");
                  setSelectedChildId("");
                }}
                className="flex-1"
              >
                Link another child
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4" data-testid="page-link-to-school">
      <div className="flex items-start gap-3">
        <GraduationCap className="h-8 w-8 text-blue-600 mt-1" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            Link your child to their school record
          </h1>
          <p className="text-muted-foreground mt-1">
            Your school will give you an 8-character code. Enter it here to
            see your child's school progress alongside their family activity.
          </p>
        </div>
      </div>

      {children.length === 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have any children in your family yet. Add a child from
            Settings before linking to school.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="child-select">Family child</Label>
                <Select
                  value={selectedChildId}
                  onValueChange={setSelectedChildId}
                >
                  <SelectTrigger id="child-select" data-testid="link-school-child-select">
                    <SelectValue placeholder="Pick a child to link" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link-code">School code</Label>
                <Input
                  id="link-code"
                  data-testid="link-school-code-input"
                  value={code}
                  onChange={(e) => setCode(sanitizeCode(e.target.value))}
                  placeholder="ABCD1234"
                  maxLength={16}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono tracking-widest uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Codes use letters and numbers — no zero, no letter O.
                </p>
              </div>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full"
                data-testid="link-school-submit"
              >
                {submitting ? "Linking…" : "Link"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

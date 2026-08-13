// SchoolAccount — self-service account page for school staff.
//
// Route: /school/account. Reached from the header user chip in the
// school workspace. Lets any signed-in staff member change their
// display name and password without admin involvement — the gap the
// pilot smoke-check found (no password-change surface existed at all).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../../utils/supabase/client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { HeroCard } from "../../components/school-ui";

export function SchoolAccount() {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [savingName, setSavingName] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setName(((data.user?.user_metadata as any)?.name as string) ?? "");
    });
  }, []);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Name can't be empty."); return; }
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: trimmed } });
      if (error) throw error;
      // Keep the legacy greeting fallback in sync.
      try { window.localStorage.setItem("fgs_user_name", trimmed); } catch { /* ignore */ }
      toast.success("Name updated. It appears after your next sign-in or refresh.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the name.");
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    if (pwd.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (pwd !== confirm) { toast.error("Passwords don't match."); return; }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd(""); setConfirm("");
      toast.success("Password changed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the password.");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <HeroCard
        eyebrow="Account"
        title="My account"
        subtitle="Your sign-in details for the school workspace."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} disabled />
            <p className="text-xs text-slate-500">
              Your email is your sign-in ID. Ask your principal if it needs to
              change.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">Display name</Label>
            <div className="flex gap-2">
              <Input
                id="acct-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ambreen Ahmed"
              />
              <Button onClick={saveName} disabled={savingName}>
                {savingName ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="acct-pwd">New password</Label>
            <Input
              id="acct-pwd"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-pwd2">Confirm new password</Label>
            <Input
              id="acct-pwd2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void savePassword(); }}
            />
          </div>
          <Button onClick={savePassword} disabled={savingPwd}>
            {savingPwd ? "Saving…" : "Change password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default SchoolAccount;

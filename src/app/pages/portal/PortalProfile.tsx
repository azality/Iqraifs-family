// PortalProfile — the parent's own details, finally editable by the
// parent. Route: /school-portal/profile
//
// 3 Oct: "parents are saying there's no way for them to update or
// change their pin or their profile." The change-PIN page existed but
// nothing linked to it; name/email/address had no surface at all. This
// page gives a parent their own record — and a student login a plain
// path to the PIN page, nothing more.
//
// The PHONE is deliberately read-only: it is the login identity and
// the school's dedupe key. A typo here would lock the family out, so
// number changes go through the office.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { KeyRound, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { HeroCard } from "../../components/school-ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  getPortalMe, getMyProfile, updateMyProfile, type ParentProfile,
} from "../../../utils/schoolPortalApi";

export function PortalProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [subjectType, setSubjectType] = useState<string | null>(null);
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPortalMe()
      .then((me) => {
        setSubjectType(me.subjectType);
        if (me.subjectType !== "parent") return null;
        return getMyProfile();
      })
      .then((p) => {
        if (!p) return;
        setProfile(p);
        setFullName(p.fullName);
        setEmail(p.email ?? "");
        setHomeAddress(p.homeAddress ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const dirty = profile !== null && (
    fullName.trim() !== profile.fullName ||
    email.trim() !== (profile.email ?? "") ||
    homeAddress.trim() !== (profile.homeAddress ?? "")
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        homeAddress: homeAddress.trim(),
      });
      const fresh = await getMyProfile();
      setProfile(fresh);
      toast.success(t("portal.profile.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <HeroCard title={t("portal.profile.title")} subtitle={t("portal.profile.subtitle")} />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* The PIN, for every login type — the page always existed; now
          it is one tap away instead of a URL nobody knew. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <KeyRound className="h-4 w-4 text-indigo-500" /> {t("portal.profile.pinTitle")}
        </div>
        <p className="text-xs text-slate-500">{t("portal.profile.pinBody")}</p>
        {/* A parent once shared their PIN with office staff to get help.
            Say the rule where it matters. */}
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {t("portal.profile.pinWarning")}
        </p>
        <Button size="sm" onClick={() => navigate("/school-portal/change-pin")}>
          {t("portal.profile.changePin")}
        </Button>
      </div>

      {subjectType === "parent" && profile && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="text-sm font-bold text-slate-900">{t("portal.profile.detailsTitle")}</div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-name">{t("portal.profile.name")}</Label>
            <Input id="pf-name" value={fullName} maxLength={120}
              onChange={(e) => setFullName(e.target.value)} />
            <p className="text-[11px] text-slate-500">{t("portal.profile.nameHint")}</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-email">{t("portal.profile.email")}</Label>
            <Input id="pf-email" type="email" value={email} maxLength={160}
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pf-address">{t("portal.profile.address")}</Label>
            <Textarea id="pf-address" value={homeAddress} maxLength={300}
              className="h-20 text-sm"
              onChange={(e) => setHomeAddress(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>{t("portal.profile.phone")}</Label>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              {profile.phone ?? "—"}
            </div>
            <p className="text-[11px] text-slate-500">{t("portal.profile.phoneHint")}</p>
          </div>

          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            {saving ? t("portal.profile.saving") : t("portal.profile.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default PortalProfile;

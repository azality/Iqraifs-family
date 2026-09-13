// PinSlips — whole-section portal onboarding in one click.
//
// Clicking 395 students one by one is not a rollout plan (Muneeb,
// 13 Sep). Pick a section, pick Students or Parents, press Generate:
// every subject that still needs a PIN gets a fresh temporary one, and
// the page renders cut-out slips — name, GR/phone, temp PIN, the login
// link and the Urdu instruction — ready to print and hand out.
//
// Safety: the server SKIPS anyone who already chose their own PIN
// (must_change=false), so a re-run never locks out a family that is
// already logging in. Unused temporary PINs are regenerated freely —
// that is what re-printing is for. PINs appear ONLY in this response;
// they are hashed at rest, so print (or copy) before leaving the page.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, KeyRound, Printer } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin, listClasses, generatePinSlips,
  type AdminClass, type SchoolMeResponse, type PinSlipsResponse,
} from "../../../utils/schoolApi";
import { NoAccessRedirect } from "../../components/school-ui";

export function PinSlips() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [searchParams] = useSearchParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [sectionId, setSectionId] = useState(searchParams.get("sectionId") ?? "");
  const [subjectType, setSubjectType] = useState<"student" | "parent">(
    searchParams.get("type") === "parent" ? "parent" : "student",
  );
  const [data, setData] = useState<PinSlipsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (orgId) listClasses(orgId).then(setClasses).catch(() => {});
  }, [orgId]);

  const sectionOptions = useMemo(
    () => classes.flatMap((c) =>
      (c.sections ?? []).map((s) => ({ id: s.id, label: `${c.name} — ${s.name}` }))),
    [classes],
  );
  const orgSlug = (me?.organizations ?? []).find((o) => o.id === orgId)?.slug ?? "";
  const loginUrl = `${window.location.origin}/school-login${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ""}`;

  const generate = async () => {
    setArmed(false);
    setBusy(true);
    setError(null);
    try {
      setData(await generatePinSlips(orgId, sectionId, subjectType));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
        <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!data?.slips.length}>
          <Printer className="h-3.5 w-3.5 mr-1" /> Print slips
        </Button>
      </div>

      <div className="print:hidden">
        <h1 className="text-lg font-semibold tracking-wide text-slate-900 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-indigo-600" /> PORTAL PIN SLIPS
        </h1>
        <p className="text-sm text-slate-500">
          Generate temporary PINs for a whole section at once and print the hand-out slips.
          Anyone who has already chosen their own PIN is left untouched.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <Label className="text-xs text-slate-500">Section</Label>
          <Select value={sectionId} onValueChange={(v) => { setSectionId(v); setData(null); }}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Pick a section" /></SelectTrigger>
            <SelectContent>
              {sectionOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Slips for</Label>
          <Select value={subjectType} onValueChange={(v) => { setSubjectType(v as any); setData(null); }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="parent">Parents</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {armed ? (
          <>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void generate()}>
              Yes — issue fresh temporary PINs
            </Button>
            <Button size="sm" variant="outline" onClick={() => setArmed(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" disabled={!sectionId || busy} onClick={() => setArmed(true)}>
            Generate slips
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>
      )}

      {busy && <div className="text-sm text-slate-500 print:hidden">Generating…</div>}

      {data && (
        <>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">
            {data.slips.length} slip{data.slips.length === 1 ? "" : "s"} for {data.section.className} — {data.section.name}
            {data.skipped.length > 0 && ` · ${data.skipped.length} skipped`}.
            {" "}<span className="font-medium">Print now — the PINs are shown only once.</span>
          </div>

          {data.skipped.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 print:hidden">
              Skipped: {data.skipped.map((s) => `${s.name} (${s.reason})`).join(" · ")}
            </div>
          )}

          {/* The slips — cut-out cards, 2-up for print. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 print:grid-cols-2 print:gap-2">
            {data.slips.map((s) => (
              <div
                key={s.subjectId}
                className="rounded-lg border border-slate-300 border-dashed p-3 text-[13px] leading-snug print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">{s.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {data.section.className} — {data.section.name}
                  </span>
                </div>
                {s.children && s.children.length > 0 && (
                  <div className="text-[11px] text-slate-500">Children: {s.children.join(", ")}</div>
                )}
                <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <span className="text-slate-500">Open</span>
                  <span className="break-all">{loginUrl}</span>
                  <span className="text-slate-500">Sign in as</span>
                  <span>{data.subjectType === "student" ? "Student" : "Parent"}</span>
                  <span className="text-slate-500">{data.subjectType === "student" ? "GR Number" : "Phone"}</span>
                  <span className="font-medium tabular-nums">{s.identifier}</span>
                  <span className="text-slate-500">Temporary PIN</span>
                  <span className="font-bold tabular-nums tracking-widest">{s.pin}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-slate-600">
                  You will be asked to choose your own 4-digit PIN after signing in. Do not share it.
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600" dir="rtl">
                  {data.subjectType === "student"
                    ? "طلبہ کے لیے: لنک کھولیں، اپنا GR نمبر اور یہ عارضی پن درج کریں، پھر اپنا نیا پن خود منتخب کریں۔"
                    : "والدین کے لیے: لنک کھولیں، اپنا فون نمبر اور یہ عارضی پن درج کریں، پھر اپنا نیا پن خود منتخب کریں۔"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!data && !busy && !error && (
        <Card className="print:hidden"><CardContent className="p-4 text-sm text-slate-500 italic">
          Pick a section, choose Students or Parents, then Generate. The slips render here, ready to print.
        </CardContent></Card>
      )}
    </div>
  );
}

export default PinSlips;

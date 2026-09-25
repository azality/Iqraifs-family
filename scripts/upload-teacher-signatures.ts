// Put a cleaned signature PNG on a teacher's profile (25 Sep).
//
// The school sent photos of each teacher's signature on paper; they were
// background-removed to transparent PNGs. This stores them in the same
// public school-photos bucket the UI's Upload button uses, then sets
// user_metadata.signature_url - which is exactly what the report card
// reads for the Class teacher line.
//
//   deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/upload-teacher-signatures.ts <file.png> "<Teacher Name>" [--apply]
//
// Without --apply it only resolves the teacher and reports what it would do.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const [filePath, teacherName] = Deno.args;
const APPLY = Deno.args.includes("--apply");
if (!filePath || !teacherName) {
  console.error('usage: <file.png> "<Teacher Name>" [--apply]');
  Deno.exit(1);
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Resolve the teacher by name ──
// user_roles has no org_id column (scope carries the org), so the
// org check is done AFTER the match, against the sections and roles
// this person actually holds here.

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const want = norm(teacherName);
const matches: Array<{ id: string; name: string; email: string }> = [];
for (let page = 1; page <= 10; page++) {
  const { data } = await (sb as any).auth.admin.listUsers({ page, perPage: 200 });
  const users = data?.users ?? [];
  for (const u of users) {
    const name = u.user_metadata?.name ?? u.user_metadata?.full_name ?? "";
    if (norm(name) === want) matches.push({ id: u.id, name, email: u.email ?? "" });
  }
  if (users.length < 200) break;
}

if (matches.length !== 1) {
  console.error(`✗ expected exactly 1 staff member named "${teacherName}", found ${matches.length}`);
  for (const m of matches) console.error(`   ${m.name} <${m.email}> ${m.id}`);
  Deno.exit(1);
}
const teacher = matches[0];
console.log(`Teacher: ${teacher.name} <${teacher.email}>  ${teacher.id}`);

// Which sections will carry this signature - so the operator can see
// the blast radius before applying.
const { data: secs } = await sb
  .from("class_section")
  .select("name, class:class_id(name, org_id)")
  .eq("class_teacher_user_id", teacher.id);
const mine = ((secs ?? []) as any[]).filter((s) => s.class?.org_id === ORG);
console.log(`Class teacher of: ${mine.length ? mine.map((s) => `${s.class.name} — ${s.name}`).join(", ") : "(no section)"}`);

const { data: anyRole } = await sb
  .from("user_roles").select("id").eq("user_id", teacher.id).is("revoked_at", null).limit(1);
if (mine.length === 0 && (anyRole ?? []).length === 0) {
  console.error("✗ this person holds no active role here - refusing to touch their profile");
  Deno.exit(1);
}
if (mine.length === 0) {
  console.log("NOTE: not a class teacher of any section - the signature will be stored,");
  console.log("      but the report card prints it only on the Class teacher line.");
}

if (!APPLY) {
  console.log("\ndry run — re-run with --apply");
  Deno.exit(0);
}

// ── Upload to the same public bucket the UI uses ──
const bytes = await Deno.readFile(filePath);
const key = `${ORG}/signatures/${teacher.id}.png`;
const { error: upErr } = await sb.storage.from("school-photos").upload(key, bytes, {
  contentType: "image/png",
  upsert: true,
});
if (upErr) { console.error("upload:", upErr.message); Deno.exit(1); }
const { data: pub } = sb.storage.from("school-photos").getPublicUrl(key);
// Cache-bust so a replaced signature is not served from the old copy.
const url = `${pub.publicUrl}?v=${Date.now()}`;

// ── Set it on the profile, preserving every other metadata field ──
const { data: fresh } = await (sb as any).auth.admin.getUserById(teacher.id);
const meta = { ...(fresh?.user?.user_metadata ?? {}), signature_url: url };
const { error: metaErr } = await (sb as any).auth.admin.updateUserById(teacher.id, {
  user_metadata: meta,
});
if (metaErr) { console.error("metadata:", metaErr.message); Deno.exit(1); }

console.log(`✓ signature set\n  ${url}`);

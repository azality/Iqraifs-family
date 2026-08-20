// School module — photo uploads (pilot feedback: "Photo URL" was a raw
// text field; staff have files on their laptops, not hosted URLs, and
// Google Drive share links don't hotlink as images).
//
//   POST /school/orgs/:orgId/photo-upload   (multipart form, field "file")
//     → { url }  — public URL in the school-photos bucket
//
// Gate: manage_students (office staff + admin/principal by default).
// Storage: public bucket "school-photos" (2MB cap + image mime types
// enforced bucket-side too), path <orgId>/<uuid>.<ext> so an org's
// files are groupable and never collide.

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { userCanInOrg, hasAnyRoleInOrg } from "./schoolAuth.ts";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_BYTES = 2 * 1024 * 1024;

export function installUploads(school: Hono): void {
  school.post("/orgs/:orgId/photo-upload", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await userCanInOrg(userId, orgId, "manage_students"))) {
      return c.json({ error: "You don't have permission to upload photos.", code: "FORBIDDEN_PERMISSION" }, 403);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "multipart form-data with a 'file' field required" }, 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "'file' field missing" }, 400);
    }
    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return c.json({ error: "Only JPG, PNG, or WebP images are allowed." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: "Image is too large — maximum 2 MB. Tip: a phone screenshot or resized photo works fine." }, 400);
    }

    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await serviceRoleClient.storage
      .from("school-photos")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) return c.json({ error: upErr.message }, 500);

    const { data: pub } = serviceRoleClient.storage
      .from("school-photos")
      .getPublicUrl(path);
    return c.json({ url: pub.publicUrl });
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/file-upload  (multipart form, field "file")
  //   → { url } — public URL in the school-files bucket
  //
  // Lesson/assignment attachments (pilot feedback: teachers have the
  // worksheet on their phone, not a hosted URL). Documents + images only,
  // 5 MB cap — videos belong in the Video URL field (YouTube etc.), not
  // in storage. Gate: any staff role in the org (teachers log lessons).
  // ---------------------------------------------------------------------------
  const FILE_ALLOWED = new Map<string, string>([
    ["application/pdf", "pdf"],
    ["application/msword", "doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/vnd.ms-excel", "xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["application/vnd.ms-powerpoint", "ppt"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]);
  // 15 MB (raised from 5 on pilot feedback). The frontend auto-compresses
  // images before upload; documents come through as-is. Videos still
  // belong in the Video URL field, never in storage.
  const FILE_MAX_BYTES = 15 * 1024 * 1024;
  const FILES_BUCKET = "school-files";

  school.post("/orgs/:orgId/file-upload", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "multipart form-data with a 'file' field required" }, 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "'file' field missing" }, 400);
    }
    // InPage (.inp) has no registered mime type — browsers send
    // application/octet-stream or nothing; recognize it by extension.
    let ext = FILE_ALLOWED.get(file.type);
    if (!ext && /\.inp$/i.test(file.name)) ext = "inp";
    if (!ext) {
      return c.json({
        error: "Only PDF, Word, Excel, PowerPoint, InPage, or image (JPG/PNG/WebP) files are allowed. For videos, paste a YouTube link in the Video URL field.",
      }, 400);
    }
    if (file.size > FILE_MAX_BYTES) {
      return c.json({ error: "File is too large — maximum 15 MB. For videos, use the Video URL field instead." }, 400);
    }

    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    let { error: upErr } = await serviceRoleClient.storage
      .from(FILES_BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr && /not found/i.test(upErr.message)) {
      // First-ever upload: create the bucket, then retry once.
      await (serviceRoleClient.storage as any).createBucket(FILES_BUCKET, {
        public: true,
        fileSizeLimit: FILE_MAX_BYTES,
      });
      ({ error: upErr } = await serviceRoleClient.storage
        .from(FILES_BUCKET)
        .upload(path, bytes, { contentType, upsert: false }));
    } else if (upErr && /maximum allowed size/i.test(upErr.message)) {
      // Bucket was created back when the cap was 5 MB — raise its
      // bucket-side limit to match and retry once.
      await (serviceRoleClient.storage as any).updateBucket(FILES_BUCKET, {
        public: true,
        fileSizeLimit: FILE_MAX_BYTES,
      });
      ({ error: upErr } = await serviceRoleClient.storage
        .from(FILES_BUCKET)
        .upload(path, bytes, { contentType, upsert: false }));
    }
    if (upErr) return c.json({ error: upErr.message }, 500);

    const { data: pub } = serviceRoleClient.storage
      .from(FILES_BUCKET)
      .getPublicUrl(path);
    return c.json({ url: pub.publicUrl });
  });
}

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
import { userCanInOrg } from "./schoolAuth.ts";

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
}

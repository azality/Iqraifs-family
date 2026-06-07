// TopicResourcesPanel — durable resources tied to a curriculum_topic.
//
// Worksheets, videos, PDFs, external quizzes — content the admin uploads
// once for the topic and that's available all year, across every section
// teaching the topic. Distinct from a lesson's per-day attachments.
//
// Mounted inline under each topic row in SubjectCurriculumPanel.
// Collapsed by default to keep the syllabus list scannable; the
// disclosure header shows the resource count for context.

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Video,
  ClipboardCheck,
  HelpCircle,
  Link as LinkIcon,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  listTopicResources,
  addTopicResource,
  updateTopicResource,
  deleteTopicResource,
  getTopicResourceUploadUrl,
  getTopicResourceSignedUrl,
  type TopicResource,
  type TopicResourceKind,
} from "../../../../utils/schoolApi";

/** Map a file's mime to the best-fit resource kind so the row gets the
 *  right icon + badge without making the admin pick. Default to 'pdf'
 *  for anything document-shaped, 'link' as the catch-all. */
function kindFromMime(mime: string): TopicResourceKind {
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (
    mime.startsWith("application/vnd.openxmlformats-officedocument") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return "worksheet";
  }
  return "link";
}

/** Human-readable file size for the list row. */
function fmtBytes(n: number | null | undefined): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  topicId: string;
  topicName: string;
  canManage: boolean;
}

const KIND_META: Record<
  TopicResourceKind,
  { label: string; Icon: typeof FileText; tone: string }
> = {
  pdf: {
    label: "PDF",
    Icon: FileText,
    tone: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  worksheet: {
    label: "Worksheet",
    Icon: ClipboardCheck,
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  video: {
    label: "Video",
    Icon: Video,
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  quiz: {
    label: "Quiz",
    Icon: HelpCircle,
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  link: {
    label: "Link",
    Icon: LinkIcon,
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
  },
};

function youTubeThumb(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  );
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

interface DraftState {
  kind: TopicResourceKind;
  label: string;
  url: string;
}

const EMPTY_DRAFT: DraftState = { kind: "pdf", label: "", url: "" };

export function TopicResourcesPanel({ topicId, topicName, canManage }: Props) {
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState<TopicResource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  // File upload state — separate from `adding` because the file picker
  // is a one-shot action: choose a file → upload → record → done. No
  // intermediate form to fill in (the label defaults to the file name,
  // editable after via the inline edit button).
  const [uploadingProgress, setUploadingProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listTopicResources(topicId)
      .then((r) => {
        setResources(r.resources);
        setLoaded(true);
      })
      .catch((e) => setError(e?.message || "Could not load resources"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || loaded) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAdd = async () => {
    const label = draft.label.trim();
    const url = draft.url.trim();
    if (!label) {
      toast.error("Label required");
      return;
    }
    if (!url) {
      toast.error("URL required");
      return;
    }
    setSaving(true);
    try {
      await addTopicResource(topicId, {
        kind: draft.kind,
        label,
        url,
      });
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      refresh();
      toast.success(`Added ${label}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not add resource");
    } finally {
      setSaving(false);
    }
  };

  // 2-step file upload: ask server for a signed upload URL → PUT bytes
  // directly to Supabase Storage → POST the metadata back. Keeping the
  // file off the edge function avoids its 6MB body limit and tight
  // duration ceiling, so we can handle 50MB PDFs / videos.
  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-picked after an error.
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Limit is 50 MB.`);
      return;
    }
    setSaving(true);
    setUploadingProgress(`Preparing ${file.name}…`);
    try {
      // 1. Get the signed upload URL.
      const signed = await getTopicResourceUploadUrl(topicId, {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      // 2. Upload bytes directly to Supabase Storage.
      setUploadingProgress(`Uploading ${file.name}…`);
      const putRes = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`upload failed (${putRes.status}): ${await putRes.text()}`);
      }
      // 3. Record the resource. Label defaults to filename — admin can
      //    rename via the inline edit pencil.
      setUploadingProgress(`Saving ${file.name}…`);
      await addTopicResource(topicId, {
        kind: kindFromMime(file.type || ""),
        label: file.name.replace(/\.[a-z0-9]+$/i, "") || file.name,
        storagePath: signed.storagePath,
        mimeType: file.type || undefined,
      });
      toast.success(`Uploaded ${file.name}`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setSaving(false);
      setUploadingProgress(null);
    }
  };

  // Open a file resource — mint a 5-minute signed URL and pop it in a
  // new tab. For external link resources we still use the raw URL
  // directly (no need for a server round-trip).
  const openResource = async (r: TopicResource) => {
    if (!r.storagePath) {
      window.open(r.url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const s = await getTopicResourceSignedUrl(r.id);
      window.open(s.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Could not open file");
    }
  };

  const beginEdit = (r: TopicResource) => {
    setEditingId(r.id);
    setEditDraft({ kind: r.kind, label: r.label, url: r.url });
  };

  const handleSaveEdit = async (id: string) => {
    const label = editDraft.label.trim();
    const url = editDraft.url.trim();
    if (!label || !url) {
      toast.error("Label and URL required");
      return;
    }
    setSaving(true);
    try {
      await updateTopicResource(id, {
        kind: editDraft.kind,
        label,
        url,
      });
      setEditingId(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: TopicResource) => {
    if (!window.confirm(`Remove "${r.label}" from ${topicName}?`)) return;
    setSaving(true);
    try {
      await deleteTopicResource(r.id);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    } finally {
      setSaving(false);
    }
  };

  // We don't render the disclosure header expanded with no content for
  // non-admins — fewer empty disclosures cluttering the syllabus.
  if (!canManage && loaded && resources.length === 0) {
    return null;
  }

  return (
    <div className="mt-1.5 rounded border border-slate-200 bg-slate-50/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-100"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-slate-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-slate-500" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Resources
        </span>
        {loaded && (
          <span className="text-[10px] text-slate-400">
            · {resources.length}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-200 p-2">
          {loading && (
            <p className="text-[10px] text-slate-500">Loading…</p>
          )}
          {error && !loading && (
            <p className="text-[10px] text-rose-600">{error}</p>
          )}

          {/* Existing resources */}
          {resources.length > 0 && (
            <ul className="space-y-1">
              {resources.map((r) => {
                const isEditing = editingId === r.id;
                const meta = KIND_META[r.kind];
                if (isEditing) {
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-1.5 rounded border border-violet-200 bg-violet-50/50 p-1.5"
                    >
                      <select
                        value={editDraft.kind}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            kind: e.target.value as TopicResourceKind,
                          })
                        }
                        className="h-7 rounded border border-slate-200 bg-white px-1 text-[10px]"
                      >
                        {Object.entries(KIND_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={editDraft.label}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, label: e.target.value })
                        }
                        placeholder="Label"
                        className="flex-1 min-w-[120px] h-7 text-xs"
                        maxLength={200}
                      />
                      <Input
                        value={editDraft.url}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, url: e.target.value })
                        }
                        placeholder="URL"
                        className="flex-1 min-w-[160px] h-7 text-xs"
                      />
                      <Button size="sm" onClick={() => handleSaveEdit(r.id)} disabled={saving}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  );
                }
                // For file resources we go through a signed-URL handler.
                // External link resources keep the native <a> so users can
                // ctrl-click → open-in-new-tab without the JS round-trip.
                const isFile = !!r.storagePath;
                const thumb = r.kind === "video" && !isFile ? youTubeThumb(r.url) : null;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-1.5 rounded bg-white px-2 py-1.5 ring-1 ring-slate-200"
                  >
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 " +
                        meta.tone
                      }
                    >
                      <meta.Icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </span>
                    {thumb && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        title={r.label}
                      >
                        <img
                          src={thumb}
                          alt=""
                          className="h-7 w-auto rounded ring-1 ring-slate-200"
                        />
                      </a>
                    )}
                    {isFile ? (
                      <button
                        type="button"
                        onClick={() => openResource(r)}
                        title={r.label}
                        className="flex-1 min-w-0 text-left text-xs text-slate-900 hover:underline truncate"
                      >
                        {r.label}
                        {r.byteSize ? (
                          <span className="ml-1 text-[10px] text-slate-400">
                            · {fmtBytes(r.byteSize)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-0 text-xs text-slate-900 hover:underline truncate"
                      >
                        {r.label}
                      </a>
                    )}
                    {canManage && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => beginEdit(r)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add form */}
          {canManage && adding && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded border border-dashed border-violet-300 bg-violet-50/40 p-1.5">
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as TopicResourceKind })
                }
                className="h-7 rounded border border-slate-200 bg-white px-1 text-[10px]"
              >
                {Object.entries(KIND_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Label (e.g. Fractions practice worksheet)"
                className="flex-1 min-w-[140px] h-7 text-xs"
                maxLength={200}
                autoFocus
              />
              <Input
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="URL (https://…)"
                className="flex-1 min-w-[160px] h-7 text-xs"
              />
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                <Check className="mr-1 h-3 w-3" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY_DRAFT);
                }}
                disabled={saving}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {canManage && !adding && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(true)}
                disabled={saving}
              >
                <LinkIcon className="mr-1 h-3 w-3" /> Add link
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Upload className="mr-1 h-3 w-3" /> Upload file
              </Button>
              {/* Hidden input — Button → ref.click() pattern keeps the
                  visual treatment consistent with "Add link" instead of
                  the browser's default greyed-out file input. */}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={handleFilePicked}
                accept={[
                  "application/pdf",
                  "image/*",
                  "video/mp4",
                  "video/quicktime",
                  "video/webm",
                  "audio/*",
                  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
                  "text/plain",
                  "application/zip",
                ].join(",")}
              />
              {uploadingProgress && (
                <span className="text-[10px] text-slate-600 italic">
                  {uploadingProgress}
                </span>
              )}
            </div>
          )}

          {!canManage && loaded && resources.length === 0 && (
            <p className="text-[10px] text-slate-500">
              No resources for this topic yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default TopicResourcesPanel;

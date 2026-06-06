// TopicResourcesPanel — durable resources tied to a curriculum_topic.
//
// Worksheets, videos, PDFs, external quizzes — content the admin uploads
// once for the topic and that's available all year, across every section
// teaching the topic. Distinct from a lesson's per-day attachments.
//
// Mounted inline under each topic row in SubjectCurriculumPanel.
// Collapsed by default to keep the syllabus list scannable; the
// disclosure header shows the resource count for context.

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  listTopicResources,
  addTopicResource,
  updateTopicResource,
  deleteTopicResource,
  type TopicResource,
  type TopicResourceKind,
} from "../../../../utils/schoolApi";

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
                const thumb = r.kind === "video" ? youTubeThumb(r.url) : null;
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
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 text-xs text-slate-900 hover:underline truncate"
                    >
                      {r.label}
                    </a>
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
              className="mt-1.5"
              disabled={saving}
            >
              <Plus className="mr-1 h-3 w-3" /> Add resource
            </Button>
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

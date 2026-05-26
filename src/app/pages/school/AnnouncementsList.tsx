// AnnouncementsList — admin/teacher view of announcements with filter pills.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Plus, Eye, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { HeroCard, DataTable, type DataTableColumn } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  listAnnouncements,
  deleteAnnouncement,
  type Announcement,
  type AnnouncementAudienceKind,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const AUDIENCE_LABEL: Record<AnnouncementAudienceKind, string> = {
  whole_school: "Whole school",
  class_section: "Class section",
  parents_only: "Parents only",
  students_only: "Students only",
  specific_students: "Specific students",
};

type Filter = "all" | "mine";

export function AnnouncementsList() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    getSchoolMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, []);

  const isAdmin = useMemo(() => isOrgAdmin(me, orgId), [me, orgId]);

  // Class teachers see only their own; admins/principals default to All.
  useEffect(() => {
    if (!meLoading && !isAdmin) {
      setFilter("mine");
    }
  }, [meLoading, isAdmin]);

  const refresh = () => {
    if (!orgId) return;
    listAnnouncements(orgId, filter === "mine" ? { creatorOnly: true } : {})
      .then((r) => setAnnouncements(r.announcements))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };

  useEffect(refresh, [orgId, filter]);

  if (meLoading) return null;
  // Allow teachers too (creator-only mode handles scope on backend); deny if
  // user has no school role at all.
  if (!me || me.roles.length === 0) return <Navigate to="/school" replace />;

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    try {
      await deleteAnnouncement(orgId, a.id);
      toast.success("Deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const columns: Array<DataTableColumn<Announcement>> = [
    {
      key: "title",
      header: "Title",
      cell: (a) => (
        <div>
          <div className="font-medium text-slate-900">{a.title}</div>
          <div className="text-xs text-slate-500 line-clamp-1">{a.body}</div>
        </div>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      cell: (a) => (
        <span className="text-xs text-slate-600">{AUDIENCE_LABEL[a.audience_kind]}</span>
      ),
    },
    {
      key: "published",
      header: "Published",
      width: "w-32",
      cell: (a) => (
        <span className="text-xs text-slate-600 tabular-nums">
          {new Date(a.published_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      width: "w-32",
      cell: (a) => (
        <span className="text-xs text-slate-600 tabular-nums">
          {a.expires_at ? new Date(a.expires_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "author",
      header: "Author",
      width: "w-32",
      cell: (a) => <span className="text-xs text-slate-600">{a.author_name ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (a) => (
        <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Link to={`/school/orgs/${orgId}/admin/announcements/${a.id}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View">
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Delete"
            onClick={() => handleDelete(a)}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  const pills: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "All" },
    { key: "mine", label: "Mine" },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Announcements"
        subtitle="Share news with students, parents, and staff."
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                ← Admin
              </Button>
            </Link>
            <Button
              size="sm"
              className="bg-white text-indigo-700 hover:bg-indigo-50"
              onClick={() => navigate(`/school/orgs/${orgId}/admin/announcements/new`)}
            >
              <Plus className="h-4 w-4 mr-1" /> New Announcement
            </Button>
          </div>
        }
      />

      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {pills.map((p) => (
            <button
              key={p.key}
              onClick={() => setFilter(p.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (filter === p.key
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={announcements}
        rowKey={(a) => a.id}
        onRowClick={(a) =>
          navigate(`/school/orgs/${orgId}/admin/announcements/${a.id}`)
        }
        emptyMessage="No announcements yet."
      />
    </div>
  );
}

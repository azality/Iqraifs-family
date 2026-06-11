// Thin page wrapping the existing SubstitutionsPanel with a hub back
// link. The panel handles its own loading + state.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { SubstitutionsPanel } from "./SubstitutionsPanel";
import { listAdminTeachers, type AdminTeacher } from "../../../utils/schoolApi";

export function TimetableSubstitutionsPage() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);

  useEffect(() => {
    if (!orgId) return;
    listAdminTeachers(orgId).then(setTeachers).catch(() => {});
  }, [orgId]);

  return (
    <div className="space-y-4">
      <Link to={`/school/orgs/${orgId}/admin/timetable`}>
        <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Timetable</Button>
      </Link>
      <SubstitutionsPanel orgId={orgId} teachers={teachers} />
    </div>
  );
}
export default TimetableSubstitutionsPage;

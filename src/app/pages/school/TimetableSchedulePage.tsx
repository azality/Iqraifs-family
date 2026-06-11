// Thin page wrapping the week-template editor with a back link to
// the hub. The editor itself owns its own header so we just frame it.

import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { TimetableWeekTemplate } from "./TimetableWeekTemplate";

export function TimetableSchedulePage() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  return (
    <div className="space-y-4">
      <Link to={`/school/orgs/${orgId}/admin/timetable`}>
        <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Timetable</Button>
      </Link>
      <TimetableWeekTemplate />
    </div>
  );
}
export default TimetableSchedulePage;

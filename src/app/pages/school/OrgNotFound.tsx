// Catch-all for unmatched URLs INSIDE a school org.
//
// Without this, a broken deep link fell through to the app's root
// catch-all, which bounces to "/" — and the "/" redirect follows the
// workspace context's last org, which can be a DIFFERENT school. That
// is how a broken parent link teleported the principal from IFS onto
// the demo academy's dashboard with no indication anything happened
// (7 Sep). A dead link inside an org must say so and stay in that org.

import { Link, useParams, useLocation } from "react-router";
import { SearchX } from "lucide-react";
import { Button } from "../../components/ui/button";

export function OrgNotFound() {
  const { orgId = "" } = useParams();
  const location = useLocation();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <SearchX className="mx-auto h-8 w-8 text-slate-300" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        There is no page at <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{location.pathname}</code> in
        this school.
      </p>
      <Link to={`/school/orgs/${orgId}`}>
        <Button className="mt-4" size="sm">Back to the dashboard</Button>
      </Link>
    </div>
  );
}

export default OrgNotFound;

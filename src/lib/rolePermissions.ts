// =============================================================================
// Role permissions — frontend view of the shared matrix.
//
// The actual matrix lives in supabase/functions/make-server-f116e23f/
// rolePermissions.ts (pure TS, zero imports) so the backend and frontend
// consume literally the same file — no more hand-synced copies. This
// module only exists to keep the historical `src/lib/rolePermissions`
// import path and export names stable.
// =============================================================================

export type {
  SchoolRole,
  PermissionKey,
} from "../../supabase/functions/make-server-f116e23f/rolePermissions";

export {
  ROLES,
  PERMISSION_KEYS,
  PERMISSION_KEYS as PERMISSIONS, // historical frontend name
  OVERRIDABLE_ROLE_TEMPLATES,
  DEFAULT_PERMISSIONS,
  resolveEffectivePermission,
  resolveEffectivePermission as getEffectivePermission, // historical name
  userCan,
} from "../../supabase/functions/make-server-f116e23f/rolePermissions";

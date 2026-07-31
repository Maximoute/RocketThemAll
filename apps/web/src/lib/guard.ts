import {
  requireUser as sharedRequireUser,
  requireAdmin as sharedRequireAdmin,
  resolveSessionUser as sharedResolveSessionUser
} from "@rta/auth/web-auth";

// Keep concrete local bindings instead of bare re-exports. Next's production
// tree-shaker can otherwise lose named exports across a transpiled workspace
// package and generate pages that call `undefined` at runtime.
export const requireUser = sharedRequireUser;
export const requireAdmin = sharedRequireAdmin;
export const resolveSessionUser = sharedResolveSessionUser;

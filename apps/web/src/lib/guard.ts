import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getAuthSession as sharedGetAuthSession,
  resolveSessionUser as sharedResolveSessionUser,
} from "@rta/auth/web-auth";

// Resolve authentication once per server render. RootLayout and protected
// pages share this cached result, and SessionProvider receives it as its
// initial state so the browser does not need an anonymous session API call.
export const getAuthSession = cache(sharedGetAuthSession);

export async function resolveSessionUser() {
  return sharedResolveSessionUser(await getAuthSession());
}

export async function requireUser() {
  const user = await resolveSessionUser();
  if (!user) return redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) return redirect("/profile");
  return user;
}

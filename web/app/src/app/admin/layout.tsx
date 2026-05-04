import type { ReactNode } from "react";
import AdminNav from "./AdminNav.client";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
      <AdminNav />
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

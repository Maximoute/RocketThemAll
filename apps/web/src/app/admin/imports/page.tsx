import { requireAdmin } from "../../../lib/guard";
import AdminImportsClient from "./client";

export default async function AdminImportsPage() {
  await requireAdmin();
  return <AdminImportsClient />;
}



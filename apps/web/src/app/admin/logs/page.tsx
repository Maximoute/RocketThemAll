import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

export default async function AdminLogsPage() {
  await requireAdmin();
  const [captureLogs, adminLogs] = await Promise.all([
    prisma.captureLog.findMany({ include: { user: true, card: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.adminLog.findMany({ include: { admin: true }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);

  return (
    <section className="card">
      <h1>Admin Logs</h1>
      <h2>Capture</h2>
      {captureLogs.map((log) => (
        <article key={log.id} className="card">
          <p>{log.user.username} a capture {log.card.name}</p>
        </article>
      ))}
      <h2>Admin</h2>
      {adminLogs.map((log) => (
        <article key={log.id} className="card">
          <p>{log.action}</p>
          <p>{log.target ?? "-"}</p>
        </article>
      ))}
    </section>
  );
}



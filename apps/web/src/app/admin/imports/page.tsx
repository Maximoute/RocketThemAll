import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

export default async function AdminImportsPage() {
  await requireAdmin();
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <section className="card">
      <h1>Admin Imports</h1>
      <p>Workflow: pending -&gt; downloaded -&gt; uploaded -&gt; approved/rejected/failed</p>
      {jobs.map((job) => (
        <article key={job.id} className="card">
          <p>{job.sourceUrl}</p>
          <p>Status: {job.status}</p>
          <p>Credit: {job.imageCredit ?? "-"}</p>
        </article>
      ))}
    </section>
  );
}



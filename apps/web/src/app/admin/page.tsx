import { requireAdmin } from "../../lib/guard";

export default async function AdminHomePage() {
  await requireAdmin();

  return (
    <section className="card">
      <h1>Admin</h1>
      <p>
        <a href="/admin/cards">Cards</a> | <a href="/admin/users">Users</a> | <a href="/admin/logs">Logs</a> | <a href="/admin/imports">Imports</a>
      </p>
      <p>
        Depuis Cards: gestion bibliotheques + cartes.
      </p>
    </section>
  );
}

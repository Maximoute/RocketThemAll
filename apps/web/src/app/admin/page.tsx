import { requireAdmin } from "../../lib/guard";

export default async function AdminHomePage() {
  await requireAdmin();

  return (
    <section className="card">
      <h1>Admin</h1>
      <p>
        <a href="/admin/cards">Cards</a> | <a href="/admin/users">Users</a> | <a href="/admin/inventories">Inventories</a> | <a href="/admin/logs">Logs</a> | <a href="/admin/imports">Imports</a> | <a href="/admin/config">Config</a>
      </p>
      <p>
        Depuis Cards: gestion bibliotheques + cartes. Depuis Config: forcer une apparition de carte.
      </p>
    </section>
  );
}

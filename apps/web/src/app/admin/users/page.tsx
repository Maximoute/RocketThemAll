import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string; role?: string } }) {
  await requireAdmin();
  const q = (searchParams.q ?? "").trim();
  const roleFilter = searchParams.role ?? "all";

  const users = await prisma.user.findMany({
    where: {
      ...(q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { discordId: { contains: q } }] } : {}),
      ...(roleFilter === "admin" ? { isAdmin: true } : {}),
      ...(roleFilter === "user" ? { isAdmin: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      discordId: true,
      avatarUrl: true,
      isAdmin: true
    }
  });

  return (
    <section>
      <h1 style={{ marginTop: 0, marginBottom: "4px" }}>👤 Gestion Utilisateurs</h1>
      <p style={{ color: "#6b5f4f", marginBottom: "16px" }}>
        Vue galerie: sélectionne un joueur pour ouvrir son profil. Les actions admin ne sont disponibles que depuis la page profil joueur.
      </p>

      <div className="card" style={{ marginBottom: "16px" }}>
        <form method="GET" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom ou Discord ID..."
            style={{ flex: 1, minWidth: "220px", padding: "8px 12px", border: "1px solid #e4d8c6", borderRadius: "8px" }}
          />
          <select name="role" defaultValue={roleFilter} style={{ padding: "8px 10px", border: "1px solid #e4d8c6", borderRadius: "8px" }}>
            <option value="all">Tous les rôles</option>
            <option value="admin">Admins seulement</option>
            <option value="user">Non-admins</option>
          </select>
          <button type="submit" style={{ padding: "8px 16px", background: "#d97706", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>🔍 Filtrer</button>
          {(q || roleFilter !== "all") && (
            <a href="/admin/users" style={{ padding: "8px 12px", color: "#6b5f4f", textDecoration: "none" }}>✕ Réinitialiser</a>
          )}
        </form>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#6b5f4f" }}>{users.length} utilisateur(s) trouvé(s)</p>
      </div>

      {users.length === 0 ? (
        <article className="card">Aucun utilisateur trouvé.</article>
      ) : (
        <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
          {users.map((user) => (
            <article key={user.id} className="card" style={{ marginBottom: 0, display: "grid", justifyItems: "center", textAlign: "center", gap: "0.6rem", paddingTop: "1.1rem" }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  style={{ width: "86px", height: "86px", borderRadius: "999px", objectFit: "cover", border: "2px solid #f0dcc0" }}
                />
              ) : (
                <div
                  style={{
                    width: "86px",
                    height: "86px",
                    borderRadius: "999px",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    background: "linear-gradient(135deg, #f59e0b, #f97316)",
                    color: "white"
                  }}
                >
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div>
                <strong>{user.username}</strong>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6b5f4f" }}>
                  {user.isAdmin ? "Admin" : "Joueur"}
                </p>
              </div>

              <a
                href={`/profiles/${user.discordId}`}
                style={{
                  textDecoration: "none",
                  background: "#d97706",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontWeight: 600
                }}
              >
                Consulter le profil
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}



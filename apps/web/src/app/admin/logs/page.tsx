import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

const CATEGORY_ORDER = ["spawn", "command", "booster", "recycle", "capture", "trade"] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  spawn: "Spawns",
  command: "Commandes joueurs",
  booster: "Boosters",
  recycle: "Recyclage",
  capture: "Captures",
  trade: "Trades"
};

type SearchParams = Promise<{ guildId?: string }>;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(value);
}

function renderDetails(details: unknown) {
  if (!details || typeof details !== "object") {
    return null;
  }

  return (
    <details style={{ marginTop: "0.5rem" }}>
      <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Détails</summary>
      <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.8rem", background: "#f7f7f7", padding: "0.75rem", borderRadius: "8px", overflowX: "auto" }}>
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  );
}

export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const servers = await prisma.botGuildConfig.findMany({
    where: { isActive: true },
    orderBy: { guildName: "asc" }
  });

  const selectedGuildId = resolvedSearchParams.guildId ?? servers[0]?.guildId;
  const selectedServer = servers.find((server) => server.guildId === selectedGuildId) ?? servers[0] ?? null;
  const logs = selectedServer
    ? await prisma.guildActivityLog.findMany({
        where: { guildId: selectedServer.guildId },
        orderBy: { createdAt: "desc" },
        take: 400
      })
    : [];

  const countsByCategory = new Map<string, number>();
  for (const log of logs) {
    countsByCategory.set(log.category, (countsByCategory.get(log.category) ?? 0) + 1);
  }

  return (
    <section className="card">
      <h1>Logs par serveur</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Consulte les événements joueurs et système par serveur Discord: spawns, commandes, boosters, recyclage, captures et trades.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {servers.map((server) => {
          const isActive = selectedServer?.guildId === server.guildId;
          return (
            <a
              key={server.guildId}
              href={`/admin/logs?guildId=${encodeURIComponent(server.guildId)}`}
              style={{
                textDecoration: "none",
                border: isActive ? "1px solid #d97706" : "1px solid #d6d3d1",
                background: isActive ? "#fff1db" : "#fff",
                color: "#1f1b16",
                borderRadius: "10px",
                padding: "0.75rem 1rem",
                minWidth: "220px"
              }}
            >
              <strong>{server.guildName}</strong>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{server.guildId}</div>
            </a>
          );
        })}
      </div>

      {!selectedServer ? (
        <p>Aucun serveur actif.</p>
      ) : (
        <>
          <article className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>{selectedServer.guildName}</h2>
            <p style={{ color: "var(--muted)" }}>{logs.length} log(s) récents pour ce serveur.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
              {CATEGORY_ORDER.map((category) => (
                <div key={category} style={{ border: "1px solid #e7e5e4", borderRadius: "10px", padding: "0.75rem", background: "#fcfcfc" }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{CATEGORY_LABELS[category]}</div>
                  <strong style={{ fontSize: "1.2rem" }}>{countsByCategory.get(category) ?? 0}</strong>
                </div>
              ))}
            </div>
          </article>

          {CATEGORY_ORDER.map((category) => {
            const entries = logs.filter((log) => log.category === category);
            return (
              <section key={category} style={{ marginBottom: "1.5rem" }}>
                <h2>{CATEGORY_LABELS[category]}</h2>
                {entries.length === 0 ? (
                  <p style={{ color: "var(--muted)" }}>Aucun log.</p>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {entries.map((log) => (
                      <article key={log.id} className="card" style={{ margin: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                          <strong>{log.summary}</strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{formatDate(log.createdAt)}</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.9rem" }}>
                          <span>action: {log.action}</span>
                          <span>status: {log.status ?? "-"}</span>
                          <span>joueur: {log.username ?? log.discordUserId ?? "-"}</span>
                          <span>channel: {log.channelId ?? "-"}</span>
                        </div>
                        {renderDetails(log.details)}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}



"use client";

import "./about.css";

export default function AboutPage() {
  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <div className="about-hero-content">
          <div className="about-badge">
            ✨ Bienvenue à Rocket Them All
          </div>

          <h1>
            Collectionne des
            <br />
            <span className="gradient-text">Cartes Épiques</span>
          </h1>

          <p>
            Un bot Discord révolutionnaire pour collectionner, trader et progresser. 
            Construis ta collection, monte en niveau et deviens un maître collecteur.
          </p>

          <div className="about-buttons">
            <button className="about-btn about-btn-primary">
              Rejoindre le serveur
            </button>
            <button className="about-btn about-btn-secondary">
              En savoir plus
            </button>
          </div>

          <div className="about-stats">
            <div className="about-stat">
              <div className="about-stat-value">500+</div>
              <div className="about-stat-label">Cartes</div>
            </div>
            <div className="about-stat">
              <div className="about-stat-value">10K+</div>
              <div className="about-stat-label">Collecteurs</div>
            </div>
            <div className="about-stat">
              <div className="about-stat-value">50K+</div>
              <div className="about-stat-label">Échanges</div>
            </div>
            <div className="about-stat">
              <div className="about-stat-value">∞</div>
              <div className="about-stat-label">Niveaux</div>
            </div>
          </div>
        </div>
      </section>

      {/* Gameplay Overview */}
      <section className="about-section dark-bg">
        <div className="about-section-title">
          <h2>⚔️ Concept du Jeu</h2>
          <p>Un système de collection innovant directement dans Discord</p>
        </div>
        <div className="about-cards">
          <div className="about-card">
            <div>✨</div>
            <h3>Spawn Automatique</h3>
            <p>Les cartes apparaissent aléatoirement dans le salon #capture. Sois rapide et capture-les avant les autres!</p>
          </div>
          <div className="about-card">
            <div>🛍️</div>
            <h3>Système de Collection</h3>
            <p>Collectionne toutes les cartes, complète les sets et débloquer des achievements exclusifs et des récompenses.</p>
          </div>
          <div className="about-card">
            <div>📈</div>
            <h3>Progression par Niveau</h3>
            <p>Gagne de l'XP en capturant des cartes. Chaque niveau débloque de nouveaux rares et bonus.</p>
          </div>
          <div className="about-card">
            <div>👥</div>
            <h3>Système d'Échange</h3>
            <p>Échange tes cartes en double avec d'autres collecteurs. Les échanges sont sécurisés et vérifiés.</p>
          </div>
          <div className="about-card">
            <div>⚡</div>
            <h3>Économie du Jeu</h3>
            <p>Gère ton portefeuille, investis dans des boosters et optimise tes gains pour progresser plus vite.</p>
          </div>
          <div className="about-card">
            <div>👑</div>
            <h3>Classements Mondiaux</h3>
            <p>Compete avec les autres collecteurs et grimpe les classements pour être champion.</p>
          </div>
        </div>
      </section>

      {/* Main Commands */}
      <section className="about-section light-bg">
        <div className="about-section-title">
          <h2>⚡ Commandes Principales</h2>
          <p>Utilise ces commandes dans Discord pour jouer</p>
        </div>
        <div className="about-commands">
          <div className="about-command">
            <code>/capture &lt;nom&gt;</code>
            <p>Capture une carte qui vient de spawn dans le salon</p>
          </div>
          <div className="about-command">
            <code>/inventory</code>
            <p>Affiche ton inventaire avec toutes tes cartes</p>
          </div>
          <div className="about-command">
            <code>/profile</code>
            <p>Voir ton profil, ton niveau, ton XP et tes statistiques</p>
          </div>
          <div className="about-command">
            <code>/cardinfo &lt;nom&gt;</code>
            <p>Obtenir des détails sur une carte spécifique</p>
          </div>
          <div className="about-command">
            <code>/leaderboard</code>
            <p>Voir le classement global des meilleurs collecteurs</p>
          </div>
          <div className="about-command">
            <code>/booster open</code>
            <p>Ouvrir un booster pour obtenir de nouvelles cartes</p>
          </div>
          <div className="about-command">
            <code>/trade start @user</code>
            <p>Initier un échange avec un autre collecteur</p>
          </div>
          <div className="about-command">
            <code>/trade add &lt;id&gt; &lt;carte&gt;</code>
            <p>Ajouter une carte à un échange en cours</p>
          </div>
          <div className="about-command">
            <code>/trade confirm &lt;id&gt;</code>
            <p>Confirmer et valider un échange</p>
          </div>
          <div className="about-command">
            <code>/trade cancel &lt;id&gt;</code>
            <p>Annuler un échange en cours</p>
          </div>
        </div>
      </section>

      {/* Collection System */}
      <section className="about-section dark-bg">
        <div className="about-section-title">
          <h2>🎁 Système de Collection</h2>
          <p>Complète ta collection et débloquer des récompenses</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "32px" }}>
          <div>
            <h3 style={{ fontSize: "1.5rem", marginBottom: "16px" }}>Cartes Disponibles</h3>
            <p style={{ color: "#d1d5db", marginBottom: "24px" }}>
              Rocket Them All contient plus de 500 cartes rares et épiques à collectionner. Chaque carte a sa propre rareté, artwork unique et valeur.
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {[
                { rarity: "Common", emoji: "⚪", desc: "Les cartes les plus faciles à trouver" },
                { rarity: "Uncommon", emoji: "🟢", desc: "Plus rares, plus de valeur" },
                { rarity: "Rare", emoji: "🔵", desc: "Très difficile à obtenir" },
                { rarity: "Epic", emoji: "🟣", desc: "Extrêmement rares" },
                { rarity: "Legendary", emoji: "🟡", desc: "Les plus précieuses du jeu" },
              ].map((card) => (
                <li key={card.rarity} style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "1.5rem" }}>{card.emoji}</span>
                  <div>
                    <div style={{ fontWeight: "600" }}>{card.rarity}</div>
                    <p style={{ color: "#9ca3af", fontSize: "0.875rem", margin: 0 }}>{card.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.5rem", marginBottom: "16px" }}>Stratégie de Collection</h3>
            <p style={{ color: "#d1d5db", marginBottom: "24px" }}>
              Planifie ta collecte pour maximiser tes gains et progresser plus rapidement.
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {[
                "Focus sur une série complète avant d'en commencer une autre",
                "Échange tes doublons pour obtenir les cartes manquantes",
                "Utilise les boosters stratégiquement pour augmenter tes chances",
                "Participe aux événements spéciaux pour des cartes exclusives",
                "Collabore avec d'autres collecteurs pour compléter ta collection",
              ].map((tip, idx) => (
                <li key={idx} style={{ display: "flex", gap: "12px", marginBottom: "12px", color: "#d1d5db" }}>
                  <span>✨</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="about-footer">
        <div className="about-footer-content">
          <div className="about-footer-grid">
            <div className="about-footer-col">
              <h4>Rocket Them All</h4>
              <p>Le bot Discord ultime pour collectionner, trader et progresser.</p>
            </div>
            <div className="about-footer-col">
              <h4>Navigation</h4>
              <ul>
                <li><a href="/profile">Profil</a></li>
                <li><a href="/inventory">Inventaire</a></li>
                <li><a href="/collection">Collection</a></li>
              </ul>
            </div>
            <div className="about-footer-col">
              <h4>Communauté</h4>
              <ul>
                <li><a href="#">Discord</a></li>
                <li><a href="#">GitHub</a></li>
              </ul>
            </div>
            <div className="about-footer-col">
              <h4>Support</h4>
              <ul>
                <li><a href="#">Documentation</a></li>
                <li><a href="#">FAQ</a></li>
                <li><a href="#">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="about-footer-bottom">
            <p style={{ margin: 0 }}>© 2024 Rocket Them All. Tous droits réservés. ❤️</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

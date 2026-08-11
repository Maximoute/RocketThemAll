# Rocket Them All — repository instructions

## Obsidian synchronization is mandatory

The product vault is the sibling directory `../Vault-RTA` (normally resolved as `C:\Users\lecom\OneDrive\Developpement\RocketThemAll\Vault-RTA`).

A gameplay, Discord, web, administration, data-model, security, economy, infrastructure, or deployment change is not complete until its documentation is synchronized.

For every functional change:

1. Update the relevant domain page in `../Vault-RTA`.
2. Update `../Vault-RTA/00-Cockpit/État actuel de l'application.md` when deployed/current behavior changes.
3. Append the delivery to `../Vault-RTA/00-Cockpit/Journal de bord - Application.md`.
4. Update the matching file under `docs/ai-context/`.
5. Keep proposals clearly separated from implemented and deployed behavior.
6. Mention the documentation pages changed in the handoff.

Use `../Vault-RTA/03-Developpement/Règle de synchronisation Code - Obsidian.md` for routing changes to the correct pages. If the external Vault is unavailable, update `docs/ai-context` in the same commit and report the blocked Vault synchronization explicitly.

Do not regenerate or hand-edit `docs/ai-context/*.generated.md` or `docs/ai-context/vault-index.json` unless the Vault audit is intentionally being refreshed.

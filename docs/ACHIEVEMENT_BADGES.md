# Badges d'achievements et rôles Discord de niveau

Chaque achievement RTA publié donne un badge au joueur dès qu'il est débloqué.
Le joueur peut afficher simultanément zéro à trois badges. RTA matérialise ces
badges par des rôles sur le serveur marqué `isPrimary` dans le panel admin.

RTA attribue aussi automatiquement un rôle de niveau sur ce même serveur :
`Niveau 0–10`, `Niveau 11–20`, `Niveau 21–30`, etc. Un joueur ne porte qu'un
seul rôle de niveau à la fois. Lorsqu'il change de tranche, le nouveau rôle est
ajouté et l'ancien est retiré sans toucher à ses trois badges d'achievement.
Les rôles de niveau sont maintenus au-dessus des rôles de badges dans la
hiérarchie Discord afin que le niveau du joueur apparaisse en premier.

## Configuration Discord requise

1. Ouvrir **Paramètres du serveur → Rôles** sur le serveur principal.
2. Donner au rôle du bot la permission **Gérer les rôles**.
3. Placer le rôle du bot au-dessus des rôles `🏅 ...` et `⭐ Niveau ...`.
4. Ne donner aucune permission sensible aux rôles créés par RTA.

RTA crée les rôles à la demande lors de leur première sélection. Ils sont sans
permission, non mentionnables et non séparés dans la liste des membres. Les
rôles non sélectionnés sont retirés du joueur mais conservés sur le serveur pour
être réutilisés, ce qui évite de recréer le même rôle. Les rôles de niveau sont
également créés à la demande puis synchronisés toutes les minutes.

## Interfaces

- Discord : `/achievements`, menu **Choisir jusqu'à 3 badges-rôles**.
- Site : `/achievements`, bloc **Badges Discord** avec trois emplacements.
- Admin : `/admin/achievement-badges`, état des badges, tranches et erreurs de synchronisation.

La sélection reste enregistrée si Discord est temporairement indisponible. Le
joueur peut relancer la synchronisation depuis l'une des deux interfaces.

# Webminds Radar

Suivi des visites sur les maquettes prospects : qui ouvre, combien de temps, quelles pages, quels clics, heatmaps, replays de session et email instantané à chaque ouverture.

## Mise en ligne (Vercel)

1. Importer ce repo dans Vercel (framework : **Other**, aucun build).
2. **Storage → Create Database → Neon (Postgres)** puis le connecter au projet. Vercel ajoute `DATABASE_URL` tout seul. Les tables se créent à la première requête.
3. Variables d'environnement :

| Variable | Rôle |
|---|---|
| `DASHBOARD_PASSWORD` | Optionnel. Sans cette variable, le dashboard est ouvert sans mot de passe |
| `AUTH_SECRET` | Chaîne aléatoire longue (signature des sessions) |
| `RESEND_API_KEY` | Clé API Resend pour les emails |
| `RESEND_FROM` | Expéditeur, ex. `Webminds Radar <radar@webminds.dz>` (domaine vérifié dans Resend) |
| `NOTIFY_TO` | Emails prévenus à chaque ouverture, séparés par des virgules |

4. Redéployer.

## Utilisation

2. Mettre le même code dans chaque page de chaque maquette, avant `</body>` :
   ```html
   <script src="https://radar-xi-flax.vercel.app/t.js" defer></script>
   ```
   La maquette est créée automatiquement dans Radar à la première visite (nom = titre de la page, rattachée par son adresse). Hôtes acceptés : `RADAR_ALLOWED_HOSTS` (par défaut vercel.app, netlify.app, webminds.dz). Les aperçus Vercel (`-projects.vercel.app`, `-git-`) sont ignorés.
3. Créer un **lien par interlocuteur** (DG, marketing…) et envoyer ce lien, pas l'URL brute.
4. Ouvrir la maquette soi-même avec le bouton **Ouvrir sans être compté** (ou `?wm_ignore=1`) pour ne pas fausser les stats. `?wm_ignore=0` réactive le suivi sur ce navigateur.

## Compatibilité avec la protection des maquettes

- Remplacer `X-Frame-Options: DENY` par `Content-Security-Policy: frame-ancestors 'self' https://VOTRE-RADAR.vercel.app` sinon la heatmap ne peut pas afficher la page.
- Dans le script de protection, ne pas lancer la détection DevTools quand la page est dans une iframe (`window.self !== window.top`).
- Le tracker n'enregistre rien quand la page est ouverte par la heatmap (`?wm_hm=1`).

## Ce qui est mesuré

- Visites, temps actif réel (onglet visible + activité), pages vues, profondeur de scroll, clics (texte, lien, élément), clics répétés (frustration).
- Lieu (ville/pays via Vercel), appareil, OS, navigateur, page d'entrée, n° de visite.
- Partage : un même lien ouvert sur plusieurs appareils apparaît comme « partagé ×N ».
- Replay de session (rrweb, champs de saisie masqués).
- Score d'intérêt 0-100 : visites, temps, clics, appareils, récence.

Les robots (aperçus WhatsApp, Telegram, Facebook, navigateurs headless) sont ignorés.

## Structure

```
api/      fonctions serverless (collect, login, sites, links, overview, site, session, heatmap)
lib/      base de données, auth, emails, score
public/   dashboard (index.html, app.js, app.css), tracker t.js, rrweb (rr.js, player.js)
```

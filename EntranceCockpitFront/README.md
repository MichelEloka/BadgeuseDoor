# Entrance Cockpit Front

Interface Angular destinée à la supervision globale des accès (monitoring, alerting, historique).  
Le projet ne dépend plus de MQTT : un futur backend (par exemple en Java) exposera un flux WebSocket sécurisé que ce front consommera.

- Top-barre et cartes alignées sur l’identité visuelle de `FrontBadgeauseDoor`
- Module de logs temps réel, prêt à recevoir des alertes / KPI supplémentaires
- Panneau de configuration pour saisir l’URL WebSocket métier

## Prérequis

- Node.js 18+ / npm 9+
- Aucun broker requis : seule une URL WebSocket standard est nécessaire quand le backend sera disponible

## Démarrer en local

```bash
cd EntranceCockpitFront
npm install
npm start
# http://localhost:4200
```

Par défaut l’URL de flux (`environment.wsUrl`) pointe sur `ws://localhost:9500/events` mais elle est modifiable à chaud depuis le panneau “Connexion backend”.

## Build

```bash
npm run build
```

Les artefacts de production sont générés dans `dist/entrance-cockpit-front/browser`.

## Docker

Une image prête à l’emploi est fournie :

```bash
docker build -t entrance-cockpit-front:latest .
docker run -p 4201:80 entrance-cockpit-front:latest
```

Le `docker-compose.yml` racine expose déjà ce service sur le port `4201`.

## Tests

```bash
npm test
```

Les tests unitaires utilisent Karma/Jasmine avec un service WebSocket mocké.

## API attendues

Le front dialogue avec un backend HTTP/WS. Les URLs par défaut sont définies dans `src/environments/environment*.ts`.

| Méthode | Clé d’environnement | Endpoint par défaut | Description |
| --- | --- | --- | --- |
| `WS` | `wsUrl` | `ws://localhost:9500/events` | Flux en temps réel des événements badgeuse. |
| `GET` | `usersApiUrl` | `http://localhost:9500/api/mock/users` | Récupère la liste des utilisateurs connus. |
| `POST` | `usersApiUrl` | `http://localhost:9500/api/mock/users` | Crée un utilisateur (payload `{ badgeID, firstName, lastName }`). |
| `DELETE` | `usersDeleteApiUrl` | `http://localhost:9500/api/mock/users/delete/{id}` | Supprime un utilisateur à partir de son `id` ou de son `badgeID` (le placeholder `:id` est remplacé automatiquement s’il est présent). |
| `GET` | `doorsApiUrl` | `http://localhost:9500/api/mock/doors` | Liste des portes disponibles pour l’override manuel. |
| `POST` | `manualOverrideUrl` | `http://localhost:9500/api/mock/manual-access` | Déclenche une ouverture manuelle (payload `{ firstName, lastName, doorID }`). |
| `GET` | `logDetailsApiUrl` | `http://localhost:9500/api/mock/logs/{id}` | Retourne les détails complémentaires d’un évènement (utilisé lors du clic sur un log). |

Adaptez ces valeurs à votre backend (préprod/prod) en éditant les fichiers d’environnement.

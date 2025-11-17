# Entrance Cockpit Backend

Service Spring Boot (REST + WebSocket) qui alimente les frontaux `EntranceCockpitFront` et `SecondEntranceCockpitFront`.  
Il lit les données réelles depuis PostgreSQL (tables `people`, `devices`, `floor_plans`) et diffuse en temps réel les messages venant d’un topic Kafka. Les événements sont relayés sur `/events` et un générateur local prend automatiquement le relai si Kafka est indisponible.

- Les API `GET/POST/DELETE /api/users`, `GET/POST/PATCH/DELETE /api/devices`, `GET /api/doors`, `POST /api/manual-access`, `GET /api/logs/{id}`
- Un point d’injection d’événements `POST /api/events`
- Le flux WebSocket temps réel `ws://<host>:9500/events`

## Prérequis

- Java 17+
- Maven 3.9+
- PostgreSQL accessible (ex: service `postgres` du cluster)

## Démarrage local

```bash
cd EntranceCockpitBackend
mvn spring-boot:run
```

Variables d’environnement usuelles :

```
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/badgeuse
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=password
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC=entrance-events
EVENTS_AUTO=true
```

## Docker

```bash
docker build -t entrance-cockpit-backend:latest .
docker run -p 9500:9500 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/badgeuse \
  -e SPRING_DATASOURCE_USERNAME=postgres \
  -e SPRING_DATASOURCE_PASSWORD=password \
  entrance-cockpit-backend:latest
```

## Endpoints principaux

| Méthode | Endpoint | Description |
| --- | --- | --- |
| `GET /api/users` | Liste les utilisateurs (`people`) |
| `POST /api/users` | Crée un utilisateur `{ firstName, lastName, badgeId }` |
| `DELETE /api/users/delete/{id}` | Supprime via l’id numérique ou le badge |
| `GET /api/doors` | Liste les portes connues (type `door`/`porte`) |
| `GET /api/devices` | Retourne la registry complète |
| `POST /api/devices` | Ajoute une porte/badgeuse |
| `PATCH /api/devices/{id}` | Met à jour la localisation |
| `POST /api/manual-access` | Déclenche une ouverture manuelle d’une porte |
| `GET /api/logs/{id}` | Fournit des utilisateurs liés au log demandé |
| `POST /api/events` | Publie un événement arbitraire sur le flux |
| `WS /events` | Flux temps réel consommé par les frontaux |

Les valeurs par défaut des tables sont initialisées dans `postgres/init/001_init.sql`. Kafka diffuse des messages JSON du type :

```json
{
  "badgeID": "BADGE-001",
  "doorID": "door-001",
  "action": "ALLOWED",
  "timestamp": "2025-11-16T05:00:00Z"
}
```

Ces messages sont transformés en `MonitoringEvent` et poussés aux frontaux via WebSocket. En cas d’échec de connexion à Kafka, un flux simulé reste actif pour garantir la supervision.

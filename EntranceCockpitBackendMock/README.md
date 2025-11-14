# Entrance Cockpit Backend Mock

Petit backend Java/Spring Boot pour simuler les messages WebSocket attendus par le front `EntranceCockpitFront`.

## Fonctionnalités

- Expose un WebSocket sur `ws://localhost:9500/events` (mêmes valeurs que celles configurées côté front)
- Diffuse automatiquement des essais de badge toutes les 4 secondes (configurable)
- Permet d’injecter un évènement personnalisé via `POST /api/mock/events`
- Basé sur Spring Boot 3 / Java 17

## Prérequis

- Java 17+
- Maven 3.9+

## Démarrage

```bash
cd EntranceCockpitBackendMock
mvn spring-boot:run
```

La console affiche les connexions WebSocket.  
Point de test REST :

```bash
curl -X POST http://localhost:9500/api/mock/events ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"manual_alert\",\"data\":{\"badgeID\":\"TEST\",\"doorID\":\"porte-001\",\"success\":false}}"
```

## Configuration

`src/main/resources/application.yml` expose deux options :

```yaml
mock:
  events:
    auto: true       # active l’envoi automatique
    interval: PT4S   # cadence ISO-8601 (ici toutes les 4 secondes)
```

Mettez `auto: false` si vous souhaitez piloter uniquement via l’API.

## Endpoints utiles

- `GET /api/mock/users` : retourne une liste mockée d’utilisateurs (id, prénom, nom, badgeID)
- `POST /api/mock/users` : enregistre un nouvel utilisateur (le badgeID doit être unique)
- `DELETE /api/mock/users/delete/{id}` : supprime un utilisateur existant
- `GET /api/mock/doors` : renvoie les identifiants de portes connus
- `POST /api/mock/manual-access` : simule une ouverture manuelle (uniquement `doorID` requis, `firstName`/`lastName` optionnels)
- `POST /api/mock/events` : pousse un événement personnalisé sur le flux
- `GET /api/mock/logs/{logId}` : retourne des utilisateurs potentiellement liés à un log
- WebSocket `ws://localhost:9500/events` : flux consommé par le front

## Packaging

```bash
mvn clean package
java -jar target/entrance-cockpit-backend-mock-0.0.1-SNAPSHOT.jar
```

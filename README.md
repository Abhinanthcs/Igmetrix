# Igmetrix

## Project Title & Tagline
**Igmetrix** – A lightweight Kotlin/Ktor microservice for managing genomic data.

---

## Architecture & Tech Stack Badges

[![Kotlin](https://img.shields.io/badge/Kotlin-1.9.0-%230095D5?logo=kotlin)](https://kotlinlang.org/)
[![Ktor](https://img.shields.io/badge/Ktor-2.3.4-%230092D4?logo=ktor)](https://ktor.io/)
[![JVM](https://img.shields.io/badge/JVM-17-%23A97BFF?logo=openjdk)](https://openjdk.org/)
[![Gradle](https://img.shields.io/badge/Gradle-8.5-%2320232A?logo=gradle)](https://gradle.org/)
[![Docker](https://img.shields.io/badge/Docker-%230db7ed?logo=docker)](https://www.docker.com/)

### Components
- **Ktor HTTP Server** – Handles routing, authentication and request processing.
- **Exposed ORM** – Kotlin DSL for database interaction (PostgreSQL).
- **JWT Authentication** – Secure stateless auth.
- **Docker** – Containerised deployment.
- **GitHub Actions CI** – Automated testing and image build.

---

## Feature Matrix

| Feature | Description |
|---|---|
| **REST API** | CRUD endpoints for genomic entities (samples, analyses). |
| **JWT Auth** | Secure token‑based authentication for all protected routes. |
| **PostgreSQL Integration** | Persistent storage using Exposed ORM. |
| **Docker Support** | Fast local development and production deployment via Docker. |
| **Swagger UI** | Auto‑generated OpenAPI docs at `/swagger`. |
| **Logging** | Structured logging with Logback. |
| **Testing** | JUnit5 + MockK unit & integration tests. |
| **CI/CD** | GitHub Actions pipeline for lint, test, and Docker image publishing. |

---

## System Architecture / Flow Diagram

```
Client (HTTP) --> Ktor Server --> Service Layer --> Repository (Exposed) --> PostgreSQL
```

* The client sends HTTP requests to the Ktor server.
* The server routes requests to service classes where business logic lives.
* Services use the repository layer (Exposed) to read/write data from PostgreSQL.
* Responses are returned to the client.

---

## Environment Variables Setup

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the Ktor server listens on. | `8080` |
| `DATABASE_URL` | JDBC URL for PostgreSQL (e.g., `jdbc:postgresql://localhost:5432/igmetrix`). | *none* |
| `DB_USER` | Database username. | *none* |
| `DB_PASSWORD` | Database password. | *none* |
| `JWT_SECRET` | Secret key for signing JWT tokens. | *generate a strong secret* |

Create a `.env` file at the project root (or export variables) before running the application.

---

## Database & Deployment Guide

1. **Create the PostgreSQL database**
   ```bash
   createdb igmetrix
   psql -d igmetrix -c "CREATE EXTENSION IF NOT EXISTS "uuid-ossp";"
   ```
2. **Run migrations** – The project uses Flyway (configured in `src/main/resources/db/migration`).
   ```bash
   ./mvnw flyway:migrate -Dflyway.url=$DATABASE_URL -Dflyway.user=$DB_USER -Dflyway.password=$DB_PASSWORD
   ```
3. **Local Docker development**
   ```bash
   docker compose up --build
   ```
   This starts a PostgreSQL container and the Ktor service.
4. **Production deployment**
   - Build the fat‑jar: `./mvnw package`
   - Build Docker image: `docker build -t igmetrix:latest .`
   - Run: `docker run -p 8080:8080 --env-file .env igmetrix:latest`

---

## Application Screenshots / Visual Walkthrough

> *(Replace the placeholders below with actual screenshots once available.)*

![Home Page](https://via.placeholder.com/800x400?text=Home+Page+Screenshot)

![API Documentation](https://via.placeholder.com/800x400?text=Swagger+UI+Screenshot)

---

## Building & Running

To build or run the project, use one of the following tasks:

| Task | Description |
|---|---|
| `./mvnw test` | Run the test suite |
| `./mvnw package` | Build the fat‑jar |
| `java -jar target/Igmetrix-0.0.1-jar-with-dependencies.jar` | Run the server |

If the server starts successfully, you will see output similar to:

```
2024-12-04 14:32:45.584 [main] INFO  Application - Application started in 0.303 seconds.
2024-12-04 14:32:45.682 [main] INFO  Application - Responding at http://0.0.0.0:8080
```

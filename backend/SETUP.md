# Appia Backend — Quick Setup

## Requirements
- Java 17+ (you have Java 11 — upgrade needed OR change pom.xml java.version to 11)
- Maven (auto-downloaded via mvnw on first run)

## Fix for Java 11
If you have Java 11, change in pom.xml:
```xml
<java.version>11</java.version>
```
And in all Java files change `jakarta.*` → `javax.*`

## Run
```bash
# Windows
run.bat

# Or directly
./mvnw spring-boot:run

# With your Gemini API key
GEMINI_API_KEY=your-key ./mvnw spring-boot:run
```

## API Endpoints
- GET  /api/v1/nodes              → All 5 network nodes
- GET  /api/v1/nodes/green        → Nodes with carbon < 150 gCO2/kWh
- PATCH /api/v1/nodes/{id}/telemetry → Update live energy data
- GET  /api/v1/sfcs               → All 8 SFCs
- POST /api/v1/sfcs/{id}/place    → Place SFC on a node
- POST /api/v1/sfcs/{id}/shed     → Shed a LOW priority SFC
- GET  /api/v1/advisor/recommendations → Gemini AI proactive advice
- POST /api/v1/advisor/ask        → Ask Gemini anything about your network
- GET  /api/v1/advisor/analytics  → KPIs and placement history

## H2 Database Console (dev)
http://localhost:8080/h2-console
JDBC URL: jdbc:h2:mem:appiadb
Username: appia / Password: appia

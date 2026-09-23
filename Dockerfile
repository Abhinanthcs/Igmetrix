# Build Stage
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app

# Copy pom.xml and source code directly
COPY pom.xml .
COPY src ./src

# Package application (skipping tests for fast build)
RUN mvn clean package -DskipTests

# Run Stage
FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy built JAR from builder stage
COPY --from=builder /app/target/*.jar app.jar

# Expose Ktor web port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
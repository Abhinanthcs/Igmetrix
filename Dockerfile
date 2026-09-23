# Stage 1: Build using Maven
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app

# Copy pom.xml and wrapper scripts first to cache dependencies
COPY pom.xml ./
COPY .mvn ./.mvn
COPY mvnw ./
RUN ./mvnw dependency:go-offline -B || true

# Copy source code and resources
COPY src ./src

# Build JAR package
RUN ./mvnw clean package -DskipTests

# Stage 2: Minimal Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copy compiled jar from build stage
COPY --from=builder /app/target/*.jar app.jar

# Render dynamic port exposure
EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
# Stage 1: Build stage
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /workspace

# Install bash for Gradle wrapper script
RUN apk add --no-cache bash

# Copy gradle wrapper and project definition files
COPY gradlew .
COPY gradle ./gradle
COPY build.gradle settings.gradle ./

# Convert line endings and make gradlew executable
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew

# Download dependencies (cached if build.gradle / settings.gradle didn't change)
RUN ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src ./src

# Build the Spring Boot executable JAR without running tests
RUN ./gradlew bootJar --no-daemon -x test

# Stage 2: Production Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create a non-privileged system group and user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the built jar from the builder stage
COPY --from=builder /workspace/build/libs/*.jar app.jar

# Set file ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose internal Spring Boot port
EXPOSE 8080

# Environment variables
ENV SERVER_PORT=8080 \
    JAVA_OPTS="-Djava.security.egd=file:/dev/./urandom"

# Healthcheck for backend
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD nc -z 127.0.0.1 8080 || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

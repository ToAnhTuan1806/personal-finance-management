# Stage 1: Build stage
# Keep the Gradle version aligned with gradle/wrapper/gradle-wrapper.properties.
# The builder already contains Gradle, so packaging does not download its ZIP.
FROM gradle:9.8.1-jdk21-alpine AS builder
USER root
WORKDIR /workspace

# Verify the preinstalled build tool without any network access.
RUN --network=none gradle --version

# Copy gradle wrapper and project definition files
COPY gradlew .
COPY gradle ./gradle
COPY build.gradle settings.gradle ./

# Convert line endings and make gradlew executable
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew

# Reuse downloaded artifacts across build steps and subsequent local builds.
# Retry only Maven Central HTTP 429, with bounded backoff; fail other errors immediately.
RUN --mount=type=cache,target=/home/gradle/.gradle,sharing=locked \
    attempt=1; \
    while true; do \
      gradle dependencies --no-daemon --max-workers=2 > /tmp/gradle-build.log 2>&1; result=$?; \
      cat /tmp/gradle-build.log; \
      if [ "$result" -eq 0 ]; then rm -f /tmp/gradle-build.log; break; fi; \
      if [ "$attempt" -ge 3 ] || ! grep -q 'Received status code 429' /tmp/gradle-build.log; then \
        rm -f /tmp/gradle-build.log; exit "$result"; \
      fi; \
      delay=$((attempt * 60)); \
      echo "Maven repository rate limited (HTTP 429); retrying in ${delay}s ($attempt/2)."; \
      sleep "$delay"; attempt=$((attempt + 1)); \
    done

# Copy source code
COPY src ./src

# Build the Spring Boot executable JAR without running tests
RUN --mount=type=cache,target=/home/gradle/.gradle,sharing=locked \
    attempt=1; \
    while true; do \
      gradle bootJar --no-daemon --max-workers=2 -x test > /tmp/gradle-build.log 2>&1; result=$?; \
      cat /tmp/gradle-build.log; \
      if [ "$result" -eq 0 ]; then rm -f /tmp/gradle-build.log; break; fi; \
      if [ "$attempt" -ge 3 ] || ! grep -q 'Received status code 429' /tmp/gradle-build.log; then \
        rm -f /tmp/gradle-build.log; exit "$result"; \
      fi; \
      delay=$((attempt * 60)); \
      echo "Maven repository rate limited (HTTP 429); retrying in ${delay}s ($attempt/2)."; \
      sleep "$delay"; attempt=$((attempt + 1)); \
    done

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

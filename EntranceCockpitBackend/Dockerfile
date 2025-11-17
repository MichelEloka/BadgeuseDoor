# Build stage
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests clean package

# Runtime stage
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /app/target/entrance-cockpit-backend-*.jar app.jar
EXPOSE 9500
ENTRYPOINT ["java","-jar","/app/app.jar"]

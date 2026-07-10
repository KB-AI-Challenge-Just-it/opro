FROM gradle:8.9-jdk21 AS build
WORKDIR /src
COPY . .
RUN gradle bootJar --no-daemon
FROM eclipse-temurin:21-jre
COPY --from=build /src/build/libs/*.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]

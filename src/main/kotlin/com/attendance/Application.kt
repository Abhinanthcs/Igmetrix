package com.attendance

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        module()
    }.start(wait = true)
}

fun Application.module() {
    val jwtSecret = "your-256-bit-secret-here"
    val jwtIssuer = "http://127.0.0.1:8080/"
    val jwtAudience = "http://127.0.0.1:8080/student"

    install(ContentNegotiation) {
        json()
    }

    // Initialize Database Connection
    DatabaseFactory.init()

    install(Authentication) {
        jwt("auth-jwt") {
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .withAudience(jwtAudience)
                    .withIssuer(jwtIssuer)
                    .build()
            )
            validate { credential ->
                val hasRegisterNumber = credential.payload.getClaim("registerNumber").asString() != null
                val hasDepartment = credential.payload.getClaim("department").asString() != null

                if (hasRegisterNumber || hasDepartment) {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }
    }

    routing {
        // Helper function to serve static HTML files from classpath inside JAR
        fun serveResource(path: String): ByteArray? {
            return object {}.javaClass.classLoader.getResourceAsStream("public/$path")?.readBytes()
        }

        // 1. Direct Page Routes
        get("/") {
            val bytes = serveResource("login.html")
            if (bytes != null) call.respondBytes(bytes, ContentType.Text.Html)
            else call.respondText("login.html not found", status = HttpStatusCode.NotFound)
        }

        get("/login.html") {
            val bytes = serveResource("login.html")
            if (bytes != null) call.respondBytes(bytes, ContentType.Text.Html)
            else call.respondText("login.html not found", status = HttpStatusCode.NotFound)
        }

        get("/student.html") {
            val bytes = serveResource("student.html")
            if (bytes != null) call.respondBytes(bytes, ContentType.Text.Html)
            else call.respondText("student.html not found", status = HttpStatusCode.NotFound)
        }

        get("/teacher.html") {
            val bytes = serveResource("teacher.html")
            if (bytes != null) call.respondBytes(bytes, ContentType.Text.Html)
            else call.respondText("teacher.html not found", status = HttpStatusCode.NotFound)
        }

        get("/admin.html") {
            val bytes = serveResource("admin.html")
            if (bytes != null) call.respondBytes(bytes, ContentType.Text.Html)
            else call.respondText("admin.html not found", status = HttpStatusCode.NotFound)
        }

        // 2. API Endpoints
        configureAuthRoutes(secret = jwtSecret, issuer = jwtIssuer, audience = jwtAudience)
        configureStudentRoutes()
        configureTeacherRoutes()
        configureAdminRoutes()

        // 3. Static Asset Wildcard Handler
        get("/{path...}") {
            val path = call.parameters.getAll("path")?.joinToString("/") ?: return@get
            val bytes = serveResource(path)
            if (bytes != null) {
                val contentType = when {
                    path.endsWith(".css") -> ContentType.Text.CSS
                    path.endsWith(".js") -> ContentType.Application.JavaScript
                    path.endsWith(".html") -> ContentType.Text.Html
                    path.endsWith(".svg") -> ContentType.Image.SVG
                    path.endsWith(".png") -> ContentType.Image.PNG
                    path.endsWith(".jpg") || path.endsWith(".jpeg") -> ContentType.Image.JPEG
                    path.endsWith(".ico") -> ContentType.Image.XIcon
                    else -> ContentType.Application.OctetStream
                }
                call.respondBytes(bytes, contentType)
            } else {
                call.respondText("File not found: $path", status = HttpStatusCode.NotFound)
            }
        }
    }
}
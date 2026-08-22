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
import java.io.File

fun main() {
    embeddedServer(Netty, port = 8081, host = "127.0.0.1") {
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

    // Initialize PostgreSQL Database Connection & Schema Check
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

                // Validates if either student/teacher (registerNumber) or admin (department) claim is present
                if (hasRegisterNumber || hasDepartment) {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }
    }

    routing {
        // 1. Direct Page Routes
        get("/") {
            val file = File("src/main/resources/public/login.html")
            if (file.exists()) call.respondBytes(file.readBytes(), ContentType.Text.Html)
            else call.respondText("login.html not found", status = HttpStatusCode.NotFound)
        }

        get("/login.html") {
            val file = File("src/main/resources/public/login.html")
            if (file.exists()) call.respondBytes(file.readBytes(), ContentType.Text.Html)
            else call.respondText("login.html not found", status = HttpStatusCode.NotFound)
        }

        get("/student.html") {
            val file = File("src/main/resources/public/student.html")
            if (file.exists()) call.respondBytes(file.readBytes(), ContentType.Text.Html)
            else call.respondText("student.html not found", status = HttpStatusCode.NotFound)
        }

        get("/teacher.html") {
            val file = File("src/main/resources/public/teacher.html")
            if (file.exists()) call.respondBytes(file.readBytes(), ContentType.Text.Html)
            else call.respondText("teacher.html not found", status = HttpStatusCode.NotFound)
        }

        get("/admin.html") {
            val file = File("src/main/resources/public/admin.html")
            if (file.exists()) call.respondBytes(file.readBytes(), ContentType.Text.Html)
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
            val file = File("src/main/resources/public/$path")
            if (file.exists() && file.isFile) {
                val contentType = when {
                    path.endsWith(".css") -> ContentType.Text.CSS
                    path.endsWith(".js") -> ContentType.Application.JavaScript
                    path.endsWith(".html") -> ContentType.Text.Html
                    else -> ContentType.Application.OctetStream
                }
                call.respondBytes(file.readBytes(), contentType)
            } else {
                call.respondText("File not found: $path", status = HttpStatusCode.NotFound)
            }
        }
    }
}
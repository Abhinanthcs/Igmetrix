package com.attendance

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.header
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import java.util.concurrent.ConcurrentHashMap

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        module()
    }.start(wait = true)
}

fun Application.module() {
    val jwtSecret = System.getenv("JWT_SECRET") ?: "your-256-bit-secret-here"
    val jwtIssuer = System.getenv("JWT_ISSUER") ?: "http://127.0.0.1:8080/"
    val jwtAudience = System.getenv("JWT_AUDIENCE") ?: "http://127.0.0.1:8080/student"

    install(ContentNegotiation) {
        json()
    }

    // Initialize Database Connection & Tables
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
        // High-performance thread-safe in-memory cache for static resources
        val resourceCache = ConcurrentHashMap<String, ByteArray>()

        fun serveCachedResource(path: String): ByteArray? {
            return resourceCache.computeIfAbsent(path) {
                object {}.javaClass.classLoader.getResourceAsStream("public/$path")?.readBytes() ?: ByteArray(0)
            }.takeIf { it.isNotEmpty() }
        }

        suspend fun RoutingContext.respondStatic(fileName: String, contentType: ContentType, isHtml: Boolean = false) {
            val bytes = serveCachedResource(fileName)
            if (bytes != null) {
                if (isHtml) {
                    // HTML files shouldn't be aggressively cached to prevent stale authentication views
                    call.response.header(HttpHeaders.CacheControl, "no-cache, must-revalidate")
                } else {
                    // Static CSS/JS/SVG cached for 1 hour
                    call.response.header(HttpHeaders.CacheControl, "public, max-age=3600")
                }
                call.respondBytes(bytes, contentType)
            } else {
                call.respondText("$fileName not found", status = HttpStatusCode.NotFound)
            }
        }

        // --- 1. CLEAN & DYNAMIC ROUTE MAPPINGS ---
        get("/") { respondStatic("login.html", ContentType.Text.Html, isHtml = true) }
        get("/login") { respondStatic("login.html", ContentType.Text.Html, isHtml = true) }
        get("/login.html") { respondStatic("login.html", ContentType.Text.Html, isHtml = true) }

        get("/app/{id...}") { respondStatic("admin.html", ContentType.Text.Html, isHtml = true) }
        get("/admin.html") { respondStatic("admin.html", ContentType.Text.Html, isHtml = true) }

        get("/teacher/{id...}") { respondStatic("teacher.html", ContentType.Text.Html, isHtml = true) }
        get("/teacher.html") { respondStatic("teacher.html", ContentType.Text.Html, isHtml = true) }

        get("/student/{id...}") { respondStatic("student.html", ContentType.Text.Html, isHtml = true) }
        get("/student.html") { respondStatic("student.html", ContentType.Text.Html, isHtml = true) }

        // --- 2. API ENDPOINTS ---
        configureAuthRoutes(secret = jwtSecret, issuer = jwtIssuer, audience = jwtAudience)
        configureStudentRoutes()
        configureTeacherRoutes()
        configureAdminRoutes()

        // --- 3. STATIC ASSET WILDCARD HANDLER WITH EXTENSION ROUTING ---
        get("/{path...}") {
            val path = call.parameters.getAll("path")?.joinToString("/") ?: return@get
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
            respondStatic(path, contentType, isHtml = path.endsWith(".html"))
        }
    }
}
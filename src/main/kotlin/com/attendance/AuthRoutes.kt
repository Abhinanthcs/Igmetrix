package com.attendance

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.util.*

@Serializable
data class AdminLoginRequest(val department: String, val password: String)

@Serializable
data class TeacherLoginRequest(val teacherId: String, val dateOfBirth: String)

@Serializable
data class AuthResponse(val token: String, val department: String, val role: String)

fun Route.configureAuthRoutes(secret: String, issuer: String, audience: String) {
    route("/api/auth") {

        // Department Admin Authentication
        post("/admin-login") {
            val credentials = call.receive<AdminLoginRequest>()

            val admin = transaction {
                Admins.selectAll()
                    .where { (Admins.department eq credentials.department) and (Admins.password eq credentials.password) }
                    .singleOrNull()
            }

            if (admin != null) {
                val token = JWT.create()
                    .withAudience(audience)
                    .withIssuer(issuer)
                    .withClaim("department", admin[Admins.department])
                    .withClaim("role", admin[Admins.role])
                    .withExpiresAt(Date(System.currentTimeMillis() + 86_400_000)) // 24 hours
                    .sign(Algorithm.HMAC256(secret))

                call.respond(AuthResponse(
                    token = token,
                    department = admin[Admins.department],
                    role = admin[Admins.role]
                ))
            } else {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid department credentials."))
            }
        }

        // Teacher Authentication (Teacher ID + Date of Birth)
        post("/teacher-login") {
            val credentials = call.receive<TeacherLoginRequest>()

            val parsedDob = try {
                LocalDate.parse(credentials.dateOfBirth)
            } catch (e: Exception) {
                return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid date format. Use YYYY-MM-DD."))
            }

            val teacher = transaction {
                Users.selectAll()
                    .where {
                        (Users.registerNumber eq credentials.teacherId) and
                                (Users.dateOfBirth eq parsedDob) and
                                (Users.role eq "TEACHER")
                    }
                    .singleOrNull()
            }

            if (teacher != null) {
                val token = JWT.create()
                    .withAudience(audience)
                    .withIssuer(issuer)
                    .withClaim("teacherId", teacher[Users.registerNumber])
                    .withClaim("department", teacher[Users.department])
                    .withClaim("role", teacher[Users.role])
                    .withExpiresAt(Date(System.currentTimeMillis() + 86_400_000)) // 24 hours
                    .sign(Algorithm.HMAC256(secret))

                call.respond(AuthResponse(
                    token = token,
                    department = teacher[Users.department],
                    role = teacher[Users.role]
                ))
            } else {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid Teacher ID or Date of Birth."))
            }
        }
    }
}
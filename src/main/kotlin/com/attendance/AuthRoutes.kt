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
import java.time.format.DateTimeFormatter
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
                try {
                    LocalDate.parse(credentials.dateOfBirth, DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                } catch (e2: Exception) {
                    return@post call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("error" to "Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY.")
                    )
                }
            }

            val teacher = transaction {
                Teachers.selectAll()
                    .where {
                        (Teachers.teacherId eq credentials.teacherId) and
                                (Teachers.dateOfBirth eq parsedDob)
                    }
                    .singleOrNull()
            }

            if (teacher != null) {
                val role = "teacher"
                val token = JWT.create()
                    .withAudience(audience)
                    .withIssuer(issuer)
                    .withClaim("teacherId", teacher[Teachers.teacherId])
                    .withClaim("department", teacher[Teachers.department])
                    .withClaim("role", role)
                    .withExpiresAt(Date(System.currentTimeMillis() + 86_400_000)) // 24 hours
                    .sign(Algorithm.HMAC256(secret))

                call.respond(AuthResponse(
                    token = token,
                    department = teacher[Teachers.department],
                    role = role
                ))
            } else {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid Teacher ID or Date of Birth."))
            }
        }
    }
}
package com.attendance

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.*
import org.mindrot.jbcrypt.BCrypt

@Serializable
data class AdminLoginRequest(val department: String, val password: String)

@Serializable
data class TeacherLoginRequest(val teacherId: String, val password: String)

@Serializable
data class StudentLoginRequest(val registerNumber: String, val dateOfBirth: String)

@Serializable
data class AuthResponse(val token: String, val department: String, val role: String)

fun Route.configureAuthRoutes(secret: String, issuer: String, audience: String) {
    route("/api/auth") {

        // Student Authentication (Register Number + Date of Birth)
        post("/student-login") {
            val credentials = call.receive<StudentLoginRequest>()

            val parsedDob = try {
                LocalDate.parse(credentials.dateOfBirth.trim())
            } catch (_: Exception) {
                try {
                    LocalDate.parse(credentials.dateOfBirth.trim(), DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                } catch (_: Exception) {
                    return@post call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("error" to "Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY.")
                    )
                }
            }

            val student = transaction {
                Users.selectAll()
                    .where {
                        (Users.registerNumber.lowerCase() eq credentials.registerNumber.trim().lowercase()) and
                                (Users.role eq "student") and
                                (Users.dateOfBirth eq parsedDob)
                    }
                    .singleOrNull()
            }

            if (student != null) {
                val role = "student"
                val token = JWT.create()
                    .withAudience(audience)
                    .withIssuer(issuer)
                    .withClaim("registerNumber", student[Users.registerNumber])
                    .withClaim("department", student[Users.department])
                    .withClaim("role", role)
                    .withExpiresAt(Date(System.currentTimeMillis() + 86_400_000)) // 24 hours
                    .sign(Algorithm.HMAC256(secret))

                call.respond(AuthResponse(
                    token = token,
                    department = student[Users.department],
                    role = role
                ))
            } else {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid Register Number or Date of Birth."))
            }
        }

        // Department Admin Authentication
        post("/admin-login") {
            val credentials = call.receive<AdminLoginRequest>()

            val admin = transaction {
                Admins.selectAll()
                    .where { (Admins.department eq credentials.department.trim()) and (Admins.password eq credentials.password) }
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
        // Ensure TeacherLoginRequest DTO has: val teacherId: String, val password: String
        post("/teacher-login") {
            val credentials = call.receive<TeacherLoginRequest>()

            // Fetch teacher record by teacherId
            val teacher = transaction {
                Teachers.selectAll()
                    .where { Teachers.teacherId.lowerCase() eq credentials.teacherId.trim().lowercase() }
                    .singleOrNull()
            }

            if (teacher == null) {
                return@post call.respond(
                    HttpStatusCode.Unauthorized,
                    mapOf("error" to "Invalid Teacher ID or Password.")
                )
            }

            val storedPassword = teacher[Teachers.password]

            // Verify password safely (supports plain-text and legacy BCrypt hashes)
            val isValidPassword = when {
                storedPassword == null-> false
                storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$") -> {
                    try {
                        BCrypt.checkpw(credentials.password, storedPassword)
                    } catch (_: Exception) {
                        storedPassword == credentials.password
                    }
                }
                else -> storedPassword == credentials.password
            }

            if (isValidPassword) {
                val role = "teacher"
                val token = JWT.create()
                    .withAudience(audience)
                    .withIssuer(issuer)
                    .withClaim("teacherId", teacher[Teachers.teacherId])
                    .withClaim("department", teacher[Teachers.department])
                    .withClaim("role", role)
                    .withExpiresAt(Date(System.currentTimeMillis() + 86_400_000)) // 24 hours
                    .sign(Algorithm.HMAC256(secret))

                call.respond(
                    AuthResponse(
                        token = token,
                        department = teacher[Teachers.department],
                        role = role
                    )
                )
            } else {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    mapOf("error" to "Invalid Teacher ID or Password.")
                )
            }
        }
    }
}
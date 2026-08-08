package com.attendance

import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.http.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import java.time.LocalDate

@Serializable
data class StudentSummaryResponse(
    val registerNumber: String,
    val totalClasses: Int,
    val presentCount: Int,
    val absentCount: Int,
    val attendancePercentage: Double
)

@Serializable
data class CheckinRequest(
    val subjectCode: String,
    val subjectName: String,
    val hour: Int
)

// Data class to serialize existing records back to the client
@Serializable
data class AttendanceRecordResponse(
    val id: Int,
    val registerNumber: String,
    val subjectCode: String,
    val subjectName: String,
    val date: String,
    val hour: Int,
    val status: String
)

fun Route.configureStudentRoutes() {

    authenticate("auth-jwt") {

        // GET Dashboard
        get("/student/dashboard") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString() ?: "Student"

            call.respond(HttpStatusCode.OK, mapOf(
                "message" to "Welcome to the Secure Student Dashboard!",
                "registerNumber" to registerNum
            ))
        }

        // POST Attendance Check-in
        post("/student/checkin") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token context"))
                return@post
            }

            try {
                val request = call.receive<CheckinRequest>()
                val todayDate = LocalDate.now()

                transaction {
                    AttendanceRecords.insert {
                        it[registerNumber] = registerNum
                        it[subjectCode] = request.subjectCode
                        it[subjectName] = request.subjectName
                        it[date] = todayDate
                        it[hour] = request.hour
                        it[status] = "P"
                    }
                }

                call.respond(HttpStatusCode.Created, mapOf(
                    "message" to "Attendance marked successfully!",
                    "registerNumber" to registerNum,
                    "subjectCode" to request.subjectCode,
                    "date" to todayDate.toString(),
                    "status" to "P"
                ))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid check-in details or request format"))
            }
        }

        // GET Attendance History for the Authenticated Student
        get("/student/history") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token context"))
                return@get
            }

            // Query database for records matching this registration number
            val history = transaction {
                AttendanceRecords.selectAll().where {
                    AttendanceRecords.registerNumber eq registerNum
                }.map { row ->
                    AttendanceRecordResponse(
                        id = row[AttendanceRecords.id],
                        registerNumber = row[AttendanceRecords.registerNumber],
                        subjectCode = row[AttendanceRecords.subjectCode],
                        subjectName = row[AttendanceRecords.subjectName],
                        date = row[AttendanceRecords.date].toString(),
                        hour = row[AttendanceRecords.hour],
                        status = row[AttendanceRecords.status]
                    )
                }
            }

            call.respond(HttpStatusCode.OK, history)
        }

        // GET Attendance Summary
        get("/student/summary") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token payload"))
                return@get
            }

            val summary = transaction {
                val userRecords = AttendanceRecords.selectAll().where {
                    AttendanceRecords.registerNumber eq registerNum
                }.toList()

                val total = userRecords.size
                // Checked for both 'P' and 'PRESENT' string variations safely
                val present = userRecords.count {
                    val status = it[AttendanceRecords.status]
                    status == "P" || status == "PRESENT"
                }
                val absent = total - present

                val rawPercentage = if (total > 0) {
                    (present.toDouble() / total.toDouble()) * 100.0
                } else {
                    0.0
                }

                // Safely format double value rounded to 2 decimal places
                val roundedPercentage = Math.round(rawPercentage * 100.0) / 100.0

                StudentSummaryResponse(
                    registerNumber = registerNum,
                    totalClasses = total,
                    presentCount = present,
                    absentCount = absent,
                    attendancePercentage = roundedPercentage
                )
            }

            call.respond(HttpStatusCode.OK, summary)
        }
    }
}
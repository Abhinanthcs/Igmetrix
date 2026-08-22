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
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Serializable
data class StudentSummaryResponse(
    val registerNumber: String,
    val studentName: String,
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

@Serializable
data class PeriodAttendance(
    val hour: Int,
    val status: String
)

@Serializable
data class TodayAttendanceResponse(
    val date: String,
    val summary: String,
    val periods: List<PeriodAttendance>
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
            val semester = call.request.queryParameters["semester"]?.toIntOrNull()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token context"))
                return@get
            }

            val history = transaction {
                // Fetch student batch
                val studentBatch = Users.selectAll()
                    .where { Users.registerNumber eq registerNum }
                    .map { it[Users.batch] }
                    .singleOrNull()

                // Fetch subject codes mapped to student batch and selected semester
                val subjectCodesForSemester = if (semester != null && studentBatch != null) {
                    BatchSubjects.selectAll()
                        .where { (BatchSubjects.batch eq studentBatch) and (BatchSubjects.semester eq semester) }
                        .map { it[BatchSubjects.subjectCode] }
                } else {
                    emptyList()
                }

                val query = AttendanceRecords.selectAll().where {
                    AttendanceRecords.registerNumber eq registerNum
                }

                val allRecords = query.map { row ->
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

                if (semester != null) {
                    if (subjectCodesForSemester.isNotEmpty()) {
                        allRecords.filter { subjectCodesForSemester.contains(it.subjectCode) }
                    } else {
                        emptyList()
                    }
                } else {
                    allRecords
                }
            }

            call.respond(HttpStatusCode.OK, history)
        }

        // GET Single Subject History (/student/subject?code=KUDSC50001)
        // GET Single Subject History (/student/subject?code=KUDSC50001)
        get("/student/subject") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()
            val codeParam = call.request.queryParameters["code"]

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token context"))
                return@get
            }

            if (codeParam.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Subject code parameter is required"))
                return@get
            }

            val subjectHistory = transaction {
                AttendanceRecords.selectAll().where {
                    (AttendanceRecords.registerNumber eq registerNum) and (AttendanceRecords.subjectCode eq codeParam)
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

            call.respond(HttpStatusCode.OK, subjectHistory)
        }

        // GET Today's Attendance Endpoint
        get("/student/today") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token context"))
                return@get
            }

            val todayDate = LocalDate.now()

            val response = transaction {
                val todayRecords = AttendanceRecords.selectAll().where {
                    (AttendanceRecords.registerNumber eq registerNum) and (AttendanceRecords.date eq todayDate)
                }

                val periods = todayRecords.map { row ->
                    PeriodAttendance(
                        hour = row[AttendanceRecords.hour],
                        status = row[AttendanceRecords.status]
                    )
                }.sortedBy { it.hour }

                val presentCount = periods.count { it.status == "P" || it.status == "PRESENT" }
                val totalToday = periods.size

                val formattedDate = todayDate.format(DateTimeFormatter.ofPattern("EEEE, MMMM d"))

                TodayAttendanceResponse(
                    date = formattedDate,
                    summary = "$presentCount/$totalToday",
                    periods = periods
                )
            }

            call.respond(HttpStatusCode.OK, response)
        }

        // GET Attendance Summary
        get("/student/summary") {
            val principal = call.principal<JWTPrincipal>()
            val registerNum = principal?.payload?.getClaim("registerNumber")?.asString()
            val semester = call.request.queryParameters["semester"]?.toIntOrNull()

            if (registerNum == null) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token payload"))
                return@get
            }

            val summary = transaction {
                // Fetch student name and batch from Users table
                val studentRow = Users.selectAll()
                    .where { Users.registerNumber eq registerNum }
                    .singleOrNull()

                val studentName = studentRow?.get(Users.name) ?: "Student"
                val studentBatch = studentRow?.get(Users.batch)

                // Fetch subject codes mapped strictly to student batch and selected semester
                val subjectCodesForSemester = if (semester != null && studentBatch != null) {
                    BatchSubjects.selectAll()
                        .where { (BatchSubjects.batch eq studentBatch) and (BatchSubjects.semester eq semester) }
                        .map { it[BatchSubjects.subjectCode] }
                } else {
                    emptyList()
                }

                // Query attendance records for student
                val allRecordsForStudent = AttendanceRecords.selectAll()
                    .where { AttendanceRecords.registerNumber eq registerNum }
                    .toList()

                val filteredRecords = if (semester != null) {
                    if (subjectCodesForSemester.isNotEmpty()) {
                        allRecordsForStudent.filter { row ->
                            subjectCodesForSemester.contains(row[AttendanceRecords.subjectCode])
                        }
                    } else {
                        emptyList()
                    }
                } else {
                    allRecordsForStudent
                }

                // Compute metrics
                val total = filteredRecords.size
                val present = filteredRecords.count {
                    val status = it[AttendanceRecords.status]
                    status == "P" || status == "PRESENT"
                }
                val absent = total - present
                val rawPercentage = if (total > 0) (present.toDouble() / total * 100.0) else 0.0
                val roundedPercentage = Math.round(rawPercentage * 100.0) / 100.0

                StudentSummaryResponse(
                    registerNumber = registerNum,
                    studentName = studentName,
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
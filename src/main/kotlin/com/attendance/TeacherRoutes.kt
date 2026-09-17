package com.attendance

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import org.jetbrains.exposed.sql.andWhere

@Serializable
data class StudentStatus(
    val registerNumber: String,
    val status: String
)

@Serializable
data class BulkAttendanceRequest(
    val subjectCode: String,
    val subjectName: String,
    val date: String,
    val hour: Int,
    val department: String = "BCA",
    val students: List<StudentStatus>
)

@Serializable
data class StudentUser(
    val registerNumber: String,
    val name: String,
    val department: String
)

fun Route.configureTeacherRoutes() {

    // Filter students by department query param (?department=BCA)
    get("/teacher/students") {
        val batchParam = call.request.queryParameters["batch"]
        val semParam = call.request.queryParameters["semester"]?.toIntOrNull()
        val subjectCodeParam = call.request.queryParameters["subjectCode"]
        val dept = call.request.queryParameters["department"]

        if (batchParam.isNullOrBlank()) {
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Batch parameter is required"))
            return@get
        }

        val studentList = transaction {
            var isGlobalSubject = false

            if (!subjectCodeParam.isNullOrBlank()) {
                val subjectType = Subjects.selectAll()
                    .where { Subjects.code eq subjectCodeParam }
                    .map { it[Subjects.subjectType] }
                    .firstOrNull()

                if (subjectType?.uppercase() == "GLOBAL") {
                    isGlobalSubject = true
                }
            }

            if (isGlobalSubject && semParam != null && !subjectCodeParam.isNullOrBlank()) {
                // Return ONLY students assigned to this specific global elective
                (Users innerJoin StudentElectiveMappings)
                    .selectAll()
                    .where {
                        (Users.batch eq batchParam) and
                                (Users.role eq "student") and
                                (StudentElectiveMappings.batch eq batchParam) and
                                (StudentElectiveMappings.semester eq semParam) and
                                (StudentElectiveMappings.subjectCode eq subjectCodeParam)
                    }
                    .map { row ->
                        StudentUser(
                            registerNumber = row[Users.registerNumber],
                            name = row[Users.name],
                            department = row[Users.department]
                        )
                    }
            } else {
                // Local / Core Subject: Return all students in the batch
                var query = Users.selectAll().where {
                    (Users.batch eq batchParam) and (Users.role eq "student")
                }

                if (!dept.isNullOrBlank()) {
                    query = query.andWhere { Users.department eq dept }
                }

                query.map { row ->
                    StudentUser(
                        registerNumber = row[Users.registerNumber],
                        name = row[Users.name],
                        department = row[Users.department]
                    )
                }
            }
        }

        call.respond(studentList)
    }

    // Submit bulk attendance with Duplicate Guard
    post("/teacher/mark-bulk") {
        try {
            val request = call.receive<BulkAttendanceRequest>()
            val parsedDate = LocalDate.parse(request.date)

            var hasDuplicate = false

            transaction {
                val existingCount = AttendanceRecords.selectAll().where {
                    (AttendanceRecords.date eq parsedDate) and
                            (AttendanceRecords.hour eq request.hour) and
                            (AttendanceRecords.subjectCode eq request.subjectCode)
                }.count()

                if (existingCount > 0) {
                    hasDuplicate = true
                    return@transaction
                }

                AttendanceRecords.batchInsert(request.students) { student ->
                    this[AttendanceRecords.registerNumber] = student.registerNumber
                    this[AttendanceRecords.subjectCode] = request.subjectCode
                    this[AttendanceRecords.subjectName] = request.subjectName
                    this[AttendanceRecords.date] = parsedDate
                    this[AttendanceRecords.hour] = request.hour
                    this[AttendanceRecords.department] = request.department
                    this[AttendanceRecords.status] = student.status
                }
            }

            if (hasDuplicate) {
                call.respond(
                    HttpStatusCode.Conflict,
                    mapOf("error" to "Attendance for Hour ${request.hour} (${request.subjectCode}) on ${request.date} has already been submitted!")
                )
            } else {
                call.respond(HttpStatusCode.Created, mapOf("message" to "Bulk attendance recorded successfully!"))
            }

        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.localizedMessage ?: "Invalid payload format")))
        }
    }
}
package com.attendance

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList

// --- DTO DEFINITIONS ---
@Serializable data class CreateStudentRequest(val registerNumber: String, val name: String, val batch: String, val dateOfBirth: String, val phoneNumber: String)
@Serializable
data class CreateBatchRequest(
    val startYear: Int,
    val endYear: Int
)
@Serializable data class CreateTeacherRequest(val teacherId: String, val name: String, val dateOfBirth: String, val phoneNumber: String)
@Serializable data class DeleteStudentRequest(val registerNumber: String)
@Serializable data class DeleteBatchRequest(val batch: String)
@Serializable data class DeleteTeacherRequest(val teacherId: String)
@Serializable data class ActionLogRequest(val id: Int)

@Serializable data class StudentResponse(val registerNumber: String, val name: String, val department: String, val batch: String, val attendancePercentage: Double)
@Serializable
data class BatchResponse(
    val batch: String,
    val studentCount: Long
)
@Serializable data class TeacherResponse(val teacherId: String, val name: String, val dateOfBirth: String, val phoneNumber: String)
@Serializable data class PendingLogResponse(val id: Int, val subjectCode: String, val subjectName: String, val date: String, val hour: Int)
@Serializable data class ApiResponse(val message: String)

@Serializable
data class CreateSubjectRequest(
    val code: String,
    val name: String
)

@Serializable
data class SubjectResponse(
    val id: Int,
    val code: String,
    val name: String
)

@Serializable
data class AssignSubjectRequest(
    val batch: String,
    val semester: Int,
    val subjectCode: String
)

fun Application.configureAdminRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/admin") {

                // GET /api/admin/students
                get("/students") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    val studentsList = transaction {
                        Users.selectAll().where { (Users.department eq department) and (Users.role eq "student") }
                            .map { row ->
                                val regNum = row[Users.registerNumber]

                                val total =
                                    AttendanceRecords.selectAll().where { AttendanceRecords.registerNumber eq regNum }
                                        .count()
                                val present = AttendanceRecords.selectAll()
                                    .where { (AttendanceRecords.registerNumber eq regNum) and (AttendanceRecords.status eq "P") }
                                    .count()
                                val percentage = if (total > 0) ((present.toDouble() / total) * 100) else 0.0

                                StudentResponse(
                                    registerNumber = regNum,
                                    name = row[Users.name],
                                    department = row[Users.department],
                                    batch = row[Users.batch] ?: "N/A",
                                    attendancePercentage = Math.round(percentage * 10.0) / 10.0
                                )
                            }
                    }
                    call.respond(studentsList)
                }

                /// POST /api/admin/create-student
                post("/create-student") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"
                    val req = call.receive<CreateStudentRequest>()

                    try {
                        transaction {
                            Users.insert {
                                it[registerNumber] = req.registerNumber
                                it[name] = req.name
                                it[role] = "student"
                                it[Users.department] = department
                                it[batch] = req.batch
                                it[dateOfBirth] = LocalDate.parse(req.dateOfBirth)
                                it[phoneNumber] = req.phoneNumber
                            }
                        }
                        call.respond(HttpStatusCode.Created, ApiResponse("Student registered successfully."))
                    } catch (e: org.jetbrains.exposed.exceptions.ExposedSQLException) {
                        call.respond(HttpStatusCode.Conflict, ApiResponse("Student with this register number already exists."))
                    }
                }

                // POST /api/admin/delete-student
                post("/delete-student") {
                    val req = call.receive<DeleteStudentRequest>()
                    transaction {
                        Users.deleteWhere { registerNumber eq req.registerNumber }
                        AttendanceRecords.deleteWhere { registerNumber eq req.registerNumber }
                    }
                    call.respond(ApiResponse("Student removed."))
                }


                // GET /api/admin/batches
                get("/batches") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val batchList = transaction {
                            // Include role condition directly in the JOIN clause to preserve LEFT JOIN behavior for 0-student batches
                            Batches
                                .leftJoin(
                                    Users,
                                    onColumn = { Batches.batch },
                                    otherColumn = { Users.batch },
                                    additionalConstraint = { (Users.role eq "STUDENT") and (Users.department eq adminDepartment) }
                                )
                                .select(Batches.batch, Users.id.count())
                                .where { Batches.department eq adminDepartment }
                                .groupBy(Batches.batch)
                                .map { row ->
                                    BatchResponse(
                                        batch = row[Batches.batch],
                                        studentCount = row[Users.id.count()]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, batchList)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch batches")
                        )
                    }
                }
                // POST /api/admin/create-batch
                post("/create-batch") {
                    try {
                        val req = call.receive<CreateBatchRequest>()
                        val batchName = "${req.startYear}-${req.endYear}"

                        // Retrieve department from the authenticated admin's JWT token
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@post call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val exists = transaction {
                            Batches.selectAll()
                                .where { (Batches.batch eq batchName) and (Batches.department eq adminDepartment) }
                                .count() > 0
                        }

                        if (exists) {
                            call.respond(HttpStatusCode.Conflict, ApiResponse("Batch $batchName already exists."))
                            return@post
                        }

                        transaction {
                            Batches.insert {
                                it[batch] = batchName
                                it[department] = adminDepartment // Populates required non-null department column
                            }
                        }

                        call.respond(HttpStatusCode.Created, ApiResponse("Batch $batchName created successfully."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to process batch creation")
                        )
                    }
                }

                // POST /api/admin/delete-batch
                post("/delete-batch") {
                    val req = call.receive<DeleteBatchRequest>()
                    transaction {
                        // 1. Find all student register numbers assigned to this batch
                        val studentRegNums = Users.selectAll()
                            .where { (Users.batch eq req.batch) and (Users.role eq "student") }
                            .map { it[Users.registerNumber] }

                        if (studentRegNums.isNotEmpty()) {
                            // 2. Delete attendance history for students in this batch
                            AttendanceRecords.deleteWhere { registerNumber inList studentRegNums }

                            // 3. Delete the student accounts
                            Users.deleteWhere { (batch eq req.batch) and (role eq "student") }
                        }

                        // 4. Delete the batch entry
                        Batches.deleteWhere { batch eq req.batch }
                    }
                    call.respond(ApiResponse("Batch and all associated student records removed."))
                }

                // GET /api/admin/batch-students?batch=2024-2027
                get("/batch-students") {
                    val batchParam = call.request.queryParameters["batch"]
                    if (batchParam.isNullOrBlank()) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Batch parameter is required."))
                        return@get
                    }

                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    val studentRoster = transaction {
                        Users.selectAll().where {
                            (Users.batch eq batchParam) and
                                    (Users.department eq department) and
                                    (Users.role eq "student")
                        }.map { row ->
                            mapOf(
                                "registerNumber" to row[Users.registerNumber],
                                "name" to row[Users.name],
                                "phoneNumber" to (row[Users.phoneNumber] ?: "N/A")
                            )
                        }
                    }

                    call.respond(studentRoster)
                }

                // GET /api/admin/teachers
                get("/teachers") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    val teachersList = transaction {
                        Users.selectAll().where { (Users.department eq department) and (Users.role eq "teacher") }
                            .map { row ->
                                TeacherResponse(
                                    teacherId = row[Users.registerNumber],
                                    name = row[Users.name],
                                    dateOfBirth = row[Users.dateOfBirth].toString(),
                                    phoneNumber = row[Users.phoneNumber] ?: "N/A"
                                )
                            }
                    }
                    call.respond(teachersList)
                }

                // POST /api/admin/create-teacher
                post("/create-teacher") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"
                    val req = call.receive<CreateTeacherRequest>()

                    transaction {
                        Users.insert {
                            it[registerNumber] = req.teacherId
                            it[name] = req.name
                            it[role] = "teacher"
                            it[Users.department] = department
                            it[dateOfBirth] = LocalDate.parse(req.dateOfBirth)
                            it[phoneNumber] = req.phoneNumber
                        }
                    }
                    call.respond(HttpStatusCode.Created, ApiResponse("Teacher created successfully."))
                }

                // POST /api/admin/delete-teacher
                post("/delete-teacher") {
                    val req = call.receive<DeleteTeacherRequest>()
                    transaction {
                        Users.deleteWhere { registerNumber eq req.teacherId }
                    }
                    call.respond(ApiResponse("Teacher account removed."))
                }

                // GET /api/admin/pending
                get("/pending") {
                    val pendingLogs = transaction {
                        AttendanceRecords.selectAll().where { AttendanceRecords.status eq "PENDING" }
                            .map {
                                PendingLogResponse(
                                    id = it[AttendanceRecords.id],
                                    subjectCode = it[AttendanceRecords.subjectCode],
                                    subjectName = it[AttendanceRecords.subjectName],
                                    date = it[AttendanceRecords.date].toString(),
                                    hour = it[AttendanceRecords.hour]
                                )
                            }
                    }
                    call.respond(pendingLogs)
                }

                // POST /api/admin/approve-log
                post("/approve-log") {
                    val req = call.receive<ActionLogRequest>()
                    transaction {
                        AttendanceRecords.update({ AttendanceRecords.id eq req.id }) {
                            it[status] = "P"
                        }
                    }
                    call.respond(ApiResponse("Log approved."))
                }

                // POST /api/admin/reject-log
                post("/reject-log") {
                    val req = call.receive<ActionLogRequest>()
                    transaction {
                        AttendanceRecords.deleteWhere { id eq req.id }
                    }
                    call.respond(ApiResponse("Log rejected."))
                }

                // POST /api/admin/rollover-semester
                post("/rollover-semester") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    transaction {
                        AttendanceRecords.deleteWhere { AttendanceRecords.department eq department }
                    }
                    call.respond(ApiResponse("Semester rollover complete."))
                }
                post("/subjects") {
                    try {
                        val req = call.receive<CreateSubjectRequest>()
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@post call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        transaction {
                            Subjects.insert {
                                it[code] = req.code.trim().uppercase()
                                it[name] = req.name.trim()
                                it[department] = adminDepartment
                            }
                        }

                        call.respond(HttpStatusCode.Created, ApiResponse("Subject ${req.code} created."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to add subject.")
                        )
                    }
                }

// 2. Fetch department subject catalog
                get("/subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val subjectList = transaction {
                            Subjects.selectAll()
                                .where { Subjects.department eq adminDepartment }
                                .map { row ->
                                    SubjectResponse(
                                        id = row[Subjects.id],
                                        code = row[Subjects.code],
                                        name = row[Subjects.name]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, subjectList)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch subjects.")
                        )
                    }
                }

// 3. Assign a subject from catalog to a batch + semester
                post("/batches/assign-subject") {
                    try {
                        val req = call.receive<AssignSubjectRequest>()

                        transaction {
                            BatchSubjects.insert {
                                it[batch] = req.batch
                                it[semester] = req.semester
                                it[subjectCode] = req.subjectCode
                            }
                        }

                        call.respond(HttpStatusCode.Created, ApiResponse("Subject assigned successfully."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to assign subject.")
                        )
                    }
                }

// 4. Retrieve subjects assigned to a batch for a specific semester
                get("/batches/{batch}/semester/{sem}/subjects") {
                    try {
                        val batchName = call.parameters["batch"]
                            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Batch param required."))
                        val semester = call.parameters["sem"]?.toIntOrNull()
                            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Valid semester required."))

                        val subjects = transaction {
                            BatchSubjects
                                .innerJoin(Subjects, { BatchSubjects.subjectCode }, { Subjects.code })
                                .select(Subjects.id, Subjects.code, Subjects.name)
                                .where { (BatchSubjects.batch eq batchName) and (BatchSubjects.semester eq semester) }
                                .map { row ->
                                    SubjectResponse(
                                        id = row[Subjects.id],
                                        code = row[Subjects.code],
                                        name = row[Subjects.name]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, subjects)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch semester subjects.")
                        )
                    }
                }
            }
        }
    }
}
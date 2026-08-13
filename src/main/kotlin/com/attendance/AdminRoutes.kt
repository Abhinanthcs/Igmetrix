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
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import org.jetbrains.exposed.sql.SortOrder
import org.mindrot.jbcrypt.BCrypt

// --- DTO DEFINITIONS ---
@Serializable
data class CreateStudentRequest(
    val registerNumber: String,
    val name: String,
    val batch: String,
    val dateOfBirth: String,
    val phoneNumber: String
)

@Serializable
data class CreateBatchRequest(
    val startYear: Int,
    val endYear: Int
)

@Serializable
data class CreateTeacherRequest(
    val teacherId: String,
    val name: String,
    val dateOfBirth: String,
    val password: String? = null,
    val phoneNumber: String? = null
)

@Serializable data class DeleteStudentRequest(val registerNumber: String)
@Serializable data class DeleteBatchRequest(val batch: String)
@Serializable data class DeleteTeacherRequest(val teacherId: String)
@Serializable data class ActionLogRequest(val id: Int)

@Serializable
data class StudentResponse(
    val registerNumber: String,
    val name: String,
    val department: String,
    val batch: String,
    val attendancePercentage: Double
)

@Serializable
data class BatchResponse(
    val batch: String,
    val studentCount: Long
)

@Serializable data class TeacherResponse(val teacherId: String, val name: String, val dateOfBirth: String, val phoneNumber: String,val password: String?)
@Serializable data class PendingLogResponse(val id: Int, val subjectCode: String, val subjectName: String, val date: String, val hour: Int)
@Serializable data class ApiResponse(val message: String)

@Serializable
data class SubjectResponse(
    val id: Int,
    val code: String,
    val name: String
)

@Serializable
data class AssignedSubjectDTO(
    val id: Int,
    val batch: String,
    val semester: Int,
    val subjectCode: String,
    val subjectName: String
)

@Serializable
data class SubjectDTO(
    val code: String,
    val name: String
)

@Serializable
data class AssignSubjectRequest(
    val batch: String,
    val semester: Int,
    val subjectCode: String
)

// DTOs for Attendance Audit & Editing
@Serializable
data class AttendanceLogResponse(
    val id: Int,
    val registerNumber: String,
    val name: String,
    val subjectCode: String,
    val hour: Int,
    val date: String,
    val status: String
)

@Serializable
data class UpdateAttendanceStatusRequest(
    val id: Int? = null,
    val attendanceId: String? = null,
    val status: String
)

@Serializable
data class TimetableSlotRequest(
    val hour: Int,
    val subjectCode: String? = null
)

@Serializable
data class SaveTimetableRequest(
    val batch: String,
    val semester: Int,
    val day: String,
    val slots: List<TimetableSlotRequest>
)

@Serializable
data class TimetableSlotResponse(
    val hour: Int,
    val subjectCode: String? = null,
    val subjectName: String? = null
)

@Serializable
data class TimetableDayResponse(
    val batch: String,
    val semester: Int,
    val day: String,
    val slots: List<TimetableSlotResponse>
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

                                val total = AttendanceRecords.selectAll().where { AttendanceRecords.registerNumber eq regNum }.count()
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

                // POST /api/admin/create-student
                post("/create-student") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"
                    val req = call.receive<CreateStudentRequest>()

                    try {
                        val parsedDob = try {
                            LocalDate.parse(req.dateOfBirth.trim())
                        } catch (_: Exception) {
                            LocalDate.parse(req.dateOfBirth.trim(), DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                        }

                        transaction {
                            Users.insert {
                                it[registerNumber] = req.registerNumber.trim().uppercase()
                                it[name] = req.name.trim()
                                it[role] = "student"
                                it[Users.department] = department
                                it[batch] = req.batch
                                it[dateOfBirth] = parsedDob
                                it[phoneNumber] = req.phoneNumber
                            }
                        }
                        call.respond(HttpStatusCode.Created, ApiResponse("Student registered successfully."))
                    } catch (_: org.jetbrains.exposed.exceptions.ExposedSQLException) {
                        call.respond(HttpStatusCode.Conflict, ApiResponse("Student with this register number already exists."))
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Invalid date format or student details."))
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
                            Batches
                                .leftJoin(
                                    Users,
                                    onColumn = { Batches.batch },
                                    otherColumn = { Users.batch },
                                    additionalConstraint = { (Users.role eq "student") and (Users.department eq adminDepartment) }
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
                                it[department] = adminDepartment
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
                        val studentRegNums = Users.selectAll()
                            .where { (Users.batch eq req.batch) and (Users.role eq "student") }
                            .map { it[Users.registerNumber] }

                        if (studentRegNums.isNotEmpty()) {
                            AttendanceRecords.deleteWhere { registerNumber inList studentRegNums }
                            Users.deleteWhere { (batch eq req.batch) and (role eq "student") }
                        }

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
                        Teachers.selectAll().where { Teachers.department eq department }
                            .map { row ->
                                TeacherResponse(
                                    teacherId = row[Teachers.teacherId],
                                    name = row[Teachers.name],
                                    dateOfBirth = row[Teachers.dateOfBirth].toString(),
                                    phoneNumber = row[Teachers.phoneNumber] ?: "N/A",
                                    password = row[Teachers.password] ?: "N/A"
                                )
                            }
                    }
                    call.respond(teachersList)
                }

                // POST /api/admin/create-teacher
                post("/create-teacher") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    try {
                        val req = call.receive<CreateTeacherRequest>()

                        val rawDob = req.dateOfBirth.trim()
                        val parsedDob = try {
                            LocalDate.parse(rawDob)
                        } catch (_: Exception) {
                            try {
                                LocalDate.parse(rawDob, DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                            } catch (_: Exception) {
                                LocalDate.parse(rawDob, DateTimeFormatter.ofPattern("yyyy/MM/dd"))
                            }
                        }

                        // Hash password inside the endpoint block
                        val plainPassword = req.password?.takeIf { it.isNotBlank() } ?: rawDob
                        val hashedPassword = BCrypt.hashpw(plainPassword, BCrypt.gensalt())

                        transaction {
                            Teachers.insert {
                                it[teacherId] = req.teacherId.trim()
                                it[name] = req.name.trim()
                                it[Teachers.department] = department
                                it[dateOfBirth] = parsedDob
                                it[phoneNumber] = req.phoneNumber?.trim() ?: "N/A"
                                it[password] = plainPassword
                            }
                        }
                        call.respond(HttpStatusCode.Created, ApiResponse("Teacher created successfully."))
                    } catch (_: org.jetbrains.exposed.exceptions.ExposedSQLException) {
                        call.respond(HttpStatusCode.Conflict, ApiResponse("Teacher with this ID already exists."))
                    } catch (e: Exception) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Invalid request: ${e.localizedMessage ?: "Invalid date or teacher details."}"))
                    }
                }

                // POST /api/admin/delete-teacher
                post("/delete-teacher") {
                    val req = call.receive<DeleteTeacherRequest>()
                    transaction {
                        Teachers.deleteWhere { teacherId eq req.teacherId }
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

                // GET /api/admin/subjects
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

// POST /api/admin/subjects
                post("/subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@post call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val req = call.receive<SubjectDTO>()

                        val created = transaction {
                            Subjects.insertIgnore {
                                it[code] = req.code.trim().uppercase()
                                it[name] = req.name.trim()
                                it[department] = adminDepartment
                            }.insertedCount > 0
                        }

                        if (created) {
                            call.respond(HttpStatusCode.Created, ApiResponse("Subject added to catalog."))
                        } else {
                            call.respond(HttpStatusCode.Conflict, ApiResponse("Subject code already exists."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to add subject.")
                        )
                    }
                }

                // DELETE /api/admin/subjects/{code}
                delete("/subjects/{code}") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@delete call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val subjectCode = call.parameters["code"]?.trim()
                        if (subjectCode.isNullOrEmpty()) {
                            return@delete call.respond(
                                HttpStatusCode.BadRequest,
                                ApiResponse("Subject code required.")
                            )
                        }

                        // Check if the subject is currently assigned to any batch/semester
                        val isLinked = transaction {
                            BatchSubjects.selectAll()
                                .where { BatchSubjects.subjectCode eq subjectCode }
                                .count() > 0
                        }

                        if (isLinked) {
                            return@delete call.respond(
                                HttpStatusCode.Conflict,
                                ApiResponse("Cannot delete subject because it is linked to active semester mappings. Unlink it first!")
                            )
                        }

                        val deletedRows = transaction {
                            Subjects.deleteWhere {
                                (code eq subjectCode) and (department eq adminDepartment)
                            }
                        }

                        if (deletedRows > 0) {
                            call.respond(HttpStatusCode.OK, ApiResponse("Subject removed successfully."))
                        } else {
                            call.respond(HttpStatusCode.NotFound, ApiResponse("Subject not found or unauthorized."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to delete subject.")
                        )
                    }
                }

// POST /api/admin/batches/assign-subject
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

// GET /api/admin/assigned-subjects
                get("/assigned-subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val assignedList = transaction {
                            BatchSubjects
                                .innerJoin(Subjects, { BatchSubjects.subjectCode }, { Subjects.code })
                                .selectAll()
                                .where { Subjects.department eq adminDepartment }
                                .map { row ->
                                    AssignedSubjectDTO(
                                        id = row[BatchSubjects.id],
                                        batch = row[BatchSubjects.batch],
                                        semester = row[BatchSubjects.semester],
                                        subjectCode = row[BatchSubjects.subjectCode],
                                        subjectName = row[Subjects.name]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, assignedList)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch assigned subjects.")
                        )
                    }
                }

// DELETE /api/admin/assigned-subjects/{id}
                delete("/assigned-subjects/{id}") {
                    try {
                        val assignmentId = call.parameters["id"]?.toIntOrNull()
                            ?: return@delete call.respond(
                                HttpStatusCode.BadRequest,
                                ApiResponse("Valid assignment ID required.")
                            )

                        val deletedRows = transaction {
                            BatchSubjects.deleteWhere { id eq assignmentId }
                        }

                        if (deletedRows > 0) {
                            call.respond(HttpStatusCode.OK, ApiResponse("Subject unlinked successfully."))
                        } else {
                            call.respond(HttpStatusCode.NotFound, ApiResponse("Subject mapping not found."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to unlink subject.")
                        )
                    }
                }

// GET /api/admin/batches/{batch}/semester/{sem}/subjects
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

                // GET /api/admin/attendance-logs
                get("/attendance-logs") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(
                                HttpStatusCode.Unauthorized,
                                ApiResponse("Department missing from token payload.")
                            )

                        val dateParam = call.request.queryParameters["date"]
                        val batchParam = call.request.queryParameters["batch"]
                        val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()
                        val subjectCodeParam = call.request.queryParameters["subjectCode"]
                        val hourParam = call.request.queryParameters["hour"]?.toIntOrNull()
                        val statusParam = call.request.queryParameters["status"]

                        val logs = transaction {
                            var query = AttendanceRecords
                                .innerJoin(Users, { AttendanceRecords.registerNumber }, { Users.registerNumber })
                                .selectAll()
                                .where {
                                    (AttendanceRecords.department eq adminDepartment) and
                                            (Users.department eq adminDepartment) and
                                            (Users.role eq "student")
                                }

                            if (!dateParam.isNullOrBlank()) {
                                query = query.andWhere { AttendanceRecords.date eq LocalDate.parse(dateParam) }
                            }
                            if (!batchParam.isNullOrBlank() && batchParam != "ALL") {
                                query = query.andWhere { Users.batch eq batchParam }
                            }
                            if (semesterParam != null && !batchParam.isNullOrBlank() && batchParam != "ALL") {
                                val validSubjectCodes = BatchSubjects
                                    .select(BatchSubjects.subjectCode)
                                    .where { (BatchSubjects.batch eq batchParam) and (BatchSubjects.semester eq semesterParam) }
                                    .map { it[BatchSubjects.subjectCode] }

                                if (validSubjectCodes.isNotEmpty()) {
                                    query = query.andWhere { AttendanceRecords.subjectCode inList validSubjectCodes }
                                }
                            }
                            if (!subjectCodeParam.isNullOrBlank() && subjectCodeParam != "ALL") {
                                query = query.andWhere { AttendanceRecords.subjectCode.lowerCase() eq subjectCodeParam.lowercase() }
                            }
                            if (hourParam != null) {
                                query = query.andWhere { AttendanceRecords.hour eq hourParam }
                            }
                            if (!statusParam.isNullOrBlank() && statusParam != "ALL") {
                                query = query.andWhere { AttendanceRecords.status eq statusParam }
                            }

                            query.orderBy(
                                AttendanceRecords.registerNumber to SortOrder.ASC,
                                AttendanceRecords.date to SortOrder.DESC,
                                AttendanceRecords.hour to SortOrder.ASC
                            ).map { row ->
                                AttendanceLogResponse(
                                    id = row[AttendanceRecords.id],
                                    registerNumber = row[AttendanceRecords.registerNumber],
                                    name = row[Users.name],
                                    subjectCode = row[AttendanceRecords.subjectCode],
                                    hour = row[AttendanceRecords.hour],
                                    date = row[AttendanceRecords.date].toString(),
                                    status = row[AttendanceRecords.status]
                                )
                            }
                        }

                        call.respond(HttpStatusCode.OK, logs)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch attendance logs.")
                        )
                    }
                }

                // PUT /api/admin/attendance/{id}
                put("/attendance/{id}") {
                    try {
                        val idParam = call.parameters["id"]?.toIntOrNull()
                            ?: return@put call.respond(HttpStatusCode.BadRequest, ApiResponse("Valid log ID required."))
                        val req = call.receive<UpdateAttendanceStatusRequest>()

                        val updated = transaction {
                            AttendanceRecords.update({ AttendanceRecords.id eq idParam }) {
                                it[status] = req.status
                            }
                        } > 0

                        if (updated) {
                            call.respond(HttpStatusCode.OK, ApiResponse("Attendance status updated successfully."))
                        } else {
                            call.respond(HttpStatusCode.NotFound, ApiResponse("Attendance log not found."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to update status."))
                    }
                }

                // POST /api/admin/update-attendance
                post("/update-attendance") {
                    try {
                        val req = call.receive<UpdateAttendanceStatusRequest>()
                        val logId = req.id ?: return@post call.respond(HttpStatusCode.BadRequest, ApiResponse("Log ID is required."))

                        val updated = transaction {
                            AttendanceRecords.update({ AttendanceRecords.id eq logId }) {
                                it[status] = req.status
                            }
                        } > 0

                        if (updated) {
                            call.respond(HttpStatusCode.OK, ApiResponse("Attendance updated successfully."))
                        } else {
                            call.respond(HttpStatusCode.NotFound, ApiResponse("Attendance record not found."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to update attendance status."))
                    }
                }

                // --- TIMETABLE ROUTES ---

                // GET /api/admin/timetable?batch=2024-2027&semester=3&day=Monday
                get("/timetable") {
                    try {
                        val batchParam = call.request.queryParameters["batch"]
                        val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()
                        val dayParam = call.request.queryParameters["day"]

                        if (batchParam.isNullOrBlank() || semesterParam == null) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                ApiResponse("Batch and semester parameters are required.")
                            )
                            return@get
                        }

                        if (!dayParam.isNullOrBlank()) {
                            val slots = TimetableRepository.getTimetableForDay(batchParam, semesterParam, dayParam)
                            call.respond(HttpStatusCode.OK, slots)
                            return@get
                        }

                        val timetableDays = transaction {
                            Timetables
                                .leftJoin(Subjects, { Timetables.subjectCode }, { Subjects.code })
                                .selectAll()
                                .where {
                                    (Timetables.batch eq batchParam) and
                                            (Timetables.semester eq semesterParam)
                                }
                                .groupBy { it[Timetables.day] }
                                .map { (day, rows) ->
                                    TimetableDayResponse(
                                        batch = batchParam,
                                        semester = semesterParam,
                                        day = day,
                                        slots = rows.map { row ->
                                            TimetableSlotResponse(
                                                hour = row[Timetables.hour],
                                                subjectCode = row[Timetables.subjectCode],
                                                subjectName = row.getOrNull(Subjects.name)
                                            )
                                        }
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, timetableDays)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to fetch timetable.")
                        )
                    }
                }

                // POST /api/admin/timetable
                post("/timetable") {
                    try {
                        val req = call.receive<SaveTimetableRequest>()

                        val activeSubjects = transaction {
                            BatchSubjects
                                .selectAll()
                                .where { (BatchSubjects.batch eq req.batch) and (BatchSubjects.semester eq req.semester) }
                                .map { it[BatchSubjects.subjectCode] }
                                .toSet()
                        }

                        val invalidSlot = req.slots.firstOrNull {
                            !it.subjectCode.isNullOrBlank() && !activeSubjects.contains(it.subjectCode)
                        }

                        if (invalidSlot != null) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                ApiResponse("Subject ${invalidSlot.subjectCode} is not actively mapped to ${req.batch} Sem ${req.semester}.")
                            )
                            return@post
                        }

                        TimetableRepository.saveTimetableForDay(req)

                        call.respond(HttpStatusCode.OK, ApiResponse("Timetable updated successfully."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            ApiResponse(e.message ?: "Failed to save timetable.")
                        )
                    }
                }

            }
        }
    }
}
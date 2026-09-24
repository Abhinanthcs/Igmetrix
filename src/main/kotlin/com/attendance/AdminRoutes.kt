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
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greaterEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq

// --- DTO DEFINITIONS ---
@Serializable
data class CreateStudentRequest(
    val registerNumber: String,
    val name: String,
    val batch: String,
    val dateOfBirth: String,
    val phoneNumber: String,
    val gender: String,
    val kreapPrn: String,
    val applicationNumber: String
)
@Serializable
data class UpdateStudentRequest(
    val registerNumber: String,
    val name: String,
    val batch: String,
    val dateOfBirth: String,
    val phoneNumber: String,
    val gender: String,
    val kreapPrn: String,
    val applicationNumber: String
)
@Serializable
data class StudentDetailResponse(
    val registerNumber: String,
    val name: String,
    val department: String,
    val batch: String,
    val dateOfBirth: String,
    val phoneNumber: String,
    val gender: String,
    val kreapPrn: String,
    val applicationNumber: String,
    val totalClasses: Long,
    val presentCount: Long,
    val absentCount: Long,
    val attendancePercentage: Double,
    val subjectBreakdown: List<StudentSubjectAttendanceDTO>
)

@Serializable
data class StudentSubjectAttendanceDTO(
    val subjectCode: String,
    val subjectName: String,
    val totalClasses: Long,
    val attendedClasses: Long,
    val percentage: Double
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
data class DeleteGroupMappingRequest(
    val batch: String,
    val semester: Int,
    val groupCode: String
)

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

@Serializable data class TeacherResponse(val teacherId: String, val name: String, val dateOfBirth: String, val phoneNumber: String, val password: String?)
@Serializable data class PendingLogResponse(val id: Int, val subjectCode: String, val subjectName: String, val date: String, val hour: Int)
@Serializable data class ApiResponse(val message: String)

@Serializable
data class SubjectResponse(
    val id: Int,
    val code: String,
    val name: String,
    val subjectType: String? = "LOCAL",
    val groupCode: String? = null,
    val department: String? = null
)

@Serializable
data class AssignedSubjectDTO(
    val id: Int,
    val batch: String,
    val semester: Int,
    val subjectCode: String,
    val subjectName: String,
    val groupCode: String? = null,
    val subjectType: String? = "LOCAL",
    val department: String? = null
)

@Serializable
data class SubjectDTO(
    val code: String,
    val name: String,
    val subjectType: String? = "LOCAL",
    val groupCode: String? = null
)

@Serializable
data class AssignSubjectRequest(
    val batch: String,
    val semester: Int,
    val subjectCode: String
)

@Serializable
data class AssignGlobalGroupRequest(
    val batch: String,
    val semester: Int,
    val groupCode: String
)

@Serializable
data class GlobalGroupResponse(
    val groupCode: String,
    val subjects: List<SubjectResponse>
)

@Serializable
data class ToggleStudentElectiveRequest(
    val registerNumber: String,
    val batch: String,
    val semester: Int,
    val groupCode: String,
    val subjectCode: String,
    val action: String // "ADD" or "REMOVE"
)

@Serializable
data class StudentElectiveStatusDTO(
    val registerNumber: String,
    val name: String,
    val batch: String,
    val assignedSubjectCode: String? = null
)

@Serializable
data class AttendanceLogResponse(
    val id: Int,
    val registerNumber: String,
    val name: String,
    val subjectCode: String,
    val subjectName: String,
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
    val subjectName: String? = null,
    val groupCode: String? = null,
    val subjectType: String? = null
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

                get("/students") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    val batchParam = call.request.queryParameters["batch"]
                    val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()

                    val studentsList = transaction {
                        var query = Users.selectAll().where {
                            (Users.department eq department) and (Users.role eq "student")
                        }

                        if (!batchParam.isNullOrBlank() && batchParam != "ALL") {
                            query = query.andWhere { Users.batch eq batchParam }
                        }

                        val studentRows = query.toList()

                        studentRows.map { row ->
                            val regNum = row[Users.registerNumber]
                            val studentBatch = row[Users.batch] ?: ""

                            // Determine relevant subjects for the specified batch & semester
                            val targetSubjectCodes = if (semesterParam != null && studentBatch.isNotBlank()) {
                                BatchSubjects.select(BatchSubjects.subjectCode)
                                    .where { (BatchSubjects.batch eq studentBatch) and (BatchSubjects.semester eq semesterParam) }
                                    .map { it[BatchSubjects.subjectCode] }
                            } else {
                                emptyList()
                            }

                            // Calculate attendance percentage
                            var recordsQuery = AttendanceRecords.selectAll()
                                .where { AttendanceRecords.registerNumber eq regNum }

                            if (targetSubjectCodes.isNotEmpty()) {
                                recordsQuery = recordsQuery.andWhere { AttendanceRecords.subjectCode inList targetSubjectCodes }
                            }

                            val total = recordsQuery.count()
                            val present = recordsQuery.andWhere { AttendanceRecords.status eq "P" }.count()

                            val percentage = if (total > 0) ((present.toDouble() / total) * 100) else 0.0

                            StudentResponse(
                                registerNumber = regNum,
                                name = row[Users.name],
                                department = row[Users.department],
                                batch = studentBatch.ifBlank { "N/A" },
                                attendancePercentage = Math.round(percentage * 10.0) / 10.0
                            )
                        }
                    }
                    call.respond(studentsList)
                }

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
                                it[phoneNumber] = req.phoneNumber?.trim() ?: "N/A"
                                it[gender] = req.gender?.trim() ?: "N/A"
                                it[kreapPrn] = req.kreapPrn?.trim() ?: "N/A"
                                it[applicationNumber] = req.applicationNumber?.trim() ?: "N/A"
                            }
                        }
                        call.respond(HttpStatusCode.Created, ApiResponse("Student registered successfully."))
                    } catch (e: Exception) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Failed to register student: ${e.message}"))
                    }
                }
                put("/students/update") {
                    val req = call.receive<UpdateStudentRequest>()
                    try {
                        val parsedDob = LocalDate.parse(req.dateOfBirth.trim())
                        transaction {
                            Users.update({ Users.registerNumber eq req.registerNumber }) {
                                it[name] = req.name.trim()
                                it[batch] = req.batch
                                it[dateOfBirth] = parsedDob
                                it[phoneNumber] = req.phoneNumber?.trim() ?: "N/A"
                                it[gender] = req.gender?.trim() ?: "N/A"
                                it[kreapPrn] = req.kreapPrn?.trim() ?: "N/A"
                                it[applicationNumber] = req.applicationNumber?.trim() ?: "N/A"
                            }
                        }
                        call.respond(HttpStatusCode.OK, ApiResponse("Student updated successfully."))
                    } catch (e: Exception) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Update failed: ${e.message}"))
                    }
                }

                // --- GET DETAILED STUDENT PROFILE & ATTENDANCE BY SEMESTER ---
                get("/students/{regNumber}/details") {
                    val regNum = call.parameters["regNumber"]?.uppercase()
                        ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Reg Number required"))
                    val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()

                    val response = transaction {
                        val userRow = Users.selectAll().where { Users.registerNumber eq regNum }.firstOrNull()
                            ?: return@transaction null

                        val userBatch = userRow[Users.batch] ?: ""

                        // Fetch mapped subjects for the selected semester
                        val activeSubjects = if (semesterParam != null) {
                            BatchSubjects.innerJoin(Subjects, { BatchSubjects.subjectCode }, { Subjects.code })
                                .select(Subjects.code, Subjects.name)
                                .where { (BatchSubjects.batch eq userBatch) and (BatchSubjects.semester eq semesterParam) }
                                .map { it[Subjects.code] to it[Subjects.name] }
                        } else {
                            AttendanceRecords.select(AttendanceRecords.subjectCode, AttendanceRecords.subjectName)
                                .where { AttendanceRecords.registerNumber eq regNum }
                                .groupBy(AttendanceRecords.subjectCode, AttendanceRecords.subjectName)
                                .map { it[AttendanceRecords.subjectCode] to it[AttendanceRecords.subjectName] }
                        }

                        val subjectBreakdownList = mutableListOf<StudentSubjectAttendanceDTO>()
                        var totalAllClasses = 0L
                        var totalAllPresent = 0L

                        activeSubjects.forEach { (code, name) ->
                            val totalForSubj = AttendanceRecords.selectAll()
                                .where { (AttendanceRecords.registerNumber eq regNum) and (AttendanceRecords.subjectCode eq code) }
                                .count()

                            val presentForSubj = AttendanceRecords.selectAll()
                                .where { (AttendanceRecords.registerNumber eq regNum) and (AttendanceRecords.subjectCode eq code) and (AttendanceRecords.status eq "P") }
                                .count()

                            val perc = if (totalForSubj > 0) Math.round((presentForSubj.toDouble() / totalForSubj) * 100.0 * 10.0) / 10.0 else 0.0

                            totalAllClasses += totalForSubj
                            totalAllPresent += presentForSubj

                            subjectBreakdownList.add(
                                StudentSubjectAttendanceDTO(
                                    subjectCode = code,
                                    subjectName = name,
                                    totalClasses = totalForSubj,
                                    attendedClasses = presentForSubj,
                                    percentage = perc
                                )
                            )
                        }

                        val overallPerc = if (totalAllClasses > 0) Math.round((totalAllPresent.toDouble() / totalAllClasses) * 100.0 * 10.0) / 10.0 else 0.0

                        StudentDetailResponse(
                            registerNumber = userRow[Users.registerNumber],
                            name = userRow[Users.name],
                            department = userRow[Users.department],
                            batch = userBatch,
                            dateOfBirth = userRow[Users.dateOfBirth].toString(),
                            phoneNumber = userRow[Users.phoneNumber] ?: "N/A",
                            gender = userRow[Users.gender] ?: "N/A",
                            kreapPrn = userRow[Users.kreapPrn] ?: "N/A",
                            applicationNumber = userRow[Users.applicationNumber] ?: "N/A",
                            totalClasses = totalAllClasses,
                            presentCount = totalAllPresent,
                            absentCount = totalAllClasses - totalAllPresent,
                            attendancePercentage = overallPerc,
                            subjectBreakdown = subjectBreakdownList
                        )
                    }

                    if (response != null) {
                        call.respond(HttpStatusCode.OK, response)
                    } else {
                        call.respond(HttpStatusCode.NotFound, ApiResponse("Student profile not found."))
                    }
                }


                post("/delete-student") {
                    val req = call.receive<DeleteStudentRequest>()
                    transaction {
                        Users.deleteWhere { registerNumber eq req.registerNumber }
                        AttendanceRecords.deleteWhere { registerNumber eq req.registerNumber }
                        StudentElectiveMappings.deleteWhere { registerNumber eq req.registerNumber }
                    }
                    call.respond(ApiResponse("Student removed."))
                }

                get("/batches") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

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
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch batches"))
                    }
                }

                post("/create-batch") {
                    try {
                        val req = call.receive<CreateBatchRequest>()
                        val batchName = "${req.startYear}-${req.endYear}"

                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@post call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

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
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to process batch creation"))
                    }
                }

                post("/delete-batch") {
                    val req = call.receive<DeleteBatchRequest>()
                    transaction {
                        val studentRegNums = Users.selectAll()
                            .where { (Users.batch eq req.batch) and (Users.role eq "student") }
                            .map { it[Users.registerNumber] }

                        if (studentRegNums.isNotEmpty()) {
                            AttendanceRecords.deleteWhere { registerNumber inList studentRegNums }
                            StudentElectiveMappings.deleteWhere { registerNumber inList studentRegNums }
                            Users.deleteWhere { (batch eq req.batch) and (role eq "student") }
                        }

                        Batches.deleteWhere { batch eq req.batch }
                    }
                    call.respond(ApiResponse("Batch and all associated student records removed."))
                }

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

                        // Store plain text password directly (Fallback to DOB if password not provided)
                        val plainPassword = req.password?.takeIf { it.isNotBlank() } ?: rawDob

                        transaction {
                            Teachers.insert {
                                it[teacherId] = req.teacherId.trim()
                                it[name] = req.name.trim()
                                it[Teachers.department] = department
                                it[dateOfBirth] = parsedDob
                                it[phoneNumber] = req.phoneNumber?.trim() ?: "N/A"
                                it[password] = plainPassword // <-- Saved directly as plain text
                            }
                        }
                        call.respond(HttpStatusCode.Created, ApiResponse("Teacher created successfully."))
                    } catch (_: ExposedSQLException) {
                        call.respond(HttpStatusCode.Conflict, ApiResponse("Teacher with this ID already exists."))
                    } catch (e: Exception) {
                        call.respond(HttpStatusCode.BadRequest, ApiResponse("Invalid request: ${e.message}"))
                    }
                }

                post("/delete-teacher") {
                    val req = call.receive<DeleteTeacherRequest>()
                    transaction {
                        Teachers.deleteWhere { teacherId eq req.teacherId }
                    }
                    call.respond(ApiResponse("Teacher account removed."))
                }

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

                post("/approve-log") {
                    val req = call.receive<ActionLogRequest>()
                    transaction {
                        AttendanceRecords.update({ AttendanceRecords.id eq req.id }) {
                            it[status] = "P"
                        }
                    }
                    call.respond(ApiResponse("Log approved."))
                }

                post("/reject-log") {
                    val req = call.receive<ActionLogRequest>()
                    transaction {
                        AttendanceRecords.deleteWhere { id eq req.id }
                    }
                    call.respond(ApiResponse("Log rejected."))
                }

                post("/rollover-semester") {
                    val principal = call.principal<JWTPrincipal>()
                    val department = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                    transaction {
                        AttendanceRecords.deleteWhere { AttendanceRecords.department eq department }
                    }
                    call.respond(ApiResponse("Semester rollover complete."))
                }

                get("/subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

                        val subjectList = transaction {
                            Subjects.selectAll()
                                .where { (Subjects.department eq adminDepartment) or (Subjects.subjectType eq "GLOBAL") }
                                .map { row ->
                                    SubjectResponse(
                                        id = row[Subjects.id],
                                        code = row[Subjects.code],
                                        name = row[Subjects.name],
                                        subjectType = row[Subjects.subjectType],
                                        groupCode = row[Subjects.groupCode],
                                        department = row[Subjects.department]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, subjectList)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch subjects."))
                    }
                }

                post("/subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@post call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

                        val req = call.receive<SubjectDTO>()
                        val typeUpper = req.subjectType?.trim()?.uppercase() ?: "LOCAL"
                        val groupCodeVal = if (typeUpper == "GLOBAL") req.groupCode?.trim()?.uppercase() else null

                        if (typeUpper == "GLOBAL" && groupCodeVal.isNullOrBlank()) {
                            return@post call.respond(HttpStatusCode.BadRequest, ApiResponse("Group code is required for Global Subjects."))
                        }

                        val created = transaction {
                            Subjects.insertIgnore {
                                it[code] = req.code.trim().uppercase()
                                it[name] = req.name.trim()
                                it[department] = adminDepartment
                                it[subjectType] = typeUpper
                                it[groupCode] = groupCodeVal
                            }.insertedCount > 0
                        }

                        if (created) {
                            call.respond(HttpStatusCode.Created, ApiResponse("Subject added to catalog successfully."))
                        } else {
                            call.respond(HttpStatusCode.Conflict, ApiResponse("Subject code already exists."))
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to add subject."))
                    }
                }

                delete("/subjects/{code}") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@delete call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

                        val subjectCode = call.parameters["code"]?.trim()
                        if (subjectCode.isNullOrEmpty()) {
                            return@delete call.respond(HttpStatusCode.BadRequest, ApiResponse("Subject code required."))
                        }

                        val isLinked = transaction {
                            BatchSubjects.selectAll()
                                .where { BatchSubjects.subjectCode eq subjectCode }
                                .count() > 0
                        }

                        if (isLinked) {
                            return@delete call.respond(HttpStatusCode.Conflict, ApiResponse("Cannot delete subject because it is linked to active semester mappings. Unlink it first!"))
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
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to delete subject."))
                    }
                }

                get("/global-groups") {
                    try {
                        val groups = transaction {
                            Subjects.selectAll()
                                .where { (Subjects.subjectType eq "GLOBAL") and (Subjects.groupCode.isNotNull()) }
                                .groupBy { it[Subjects.groupCode]!! }
                                .map { (groupCode, rows) ->
                                    GlobalGroupResponse(
                                        groupCode = groupCode,
                                        subjects = rows.map { row ->
                                            SubjectResponse(
                                                id = row[Subjects.id],
                                                code = row[Subjects.code],
                                                name = row[Subjects.name],
                                                subjectType = row[Subjects.subjectType],
                                                groupCode = row[Subjects.groupCode]
                                            )
                                        }
                                    )
                                }
                        }
                        call.respond(HttpStatusCode.OK, groups)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to fetch global groups."))
                    }
                }

                post("/students/toggle-elective") {
                    try {
                        val req = call.receive<ToggleStudentElectiveRequest>()
                        val regUpper = req.registerNumber.trim().uppercase()
                        val groupUpper = req.groupCode.trim().uppercase()
                        val subjectUpper = req.subjectCode.trim().uppercase()

                        transaction {
                            if (req.action.uppercase() == "REMOVE") {
                                StudentElectiveMappings.deleteWhere {
                                    (registerNumber eq regUpper) and
                                            (batch eq req.batch) and
                                            (semester eq req.semester) and
                                            (groupCode eq groupUpper) and
                                            (subjectCode eq subjectUpper)
                                }
                            } else {
                                StudentElectiveMappings.deleteWhere {
                                    (registerNumber eq regUpper) and
                                            (batch eq req.batch) and
                                            (semester eq req.semester) and
                                            (groupCode eq groupUpper)
                                }

                                StudentElectiveMappings.insert {
                                    it[registerNumber] = regUpper
                                    it[batch] = req.batch
                                    it[semester] = req.semester
                                    it[groupCode] = groupUpper
                                    it[subjectCode] = subjectUpper
                                }
                            }
                        }

                        call.respond(HttpStatusCode.OK, ApiResponse("Student elective choice updated successfully."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to update student elective choice."))
                    }
                }

                get("/students/electives") {
                    try {
                        val batchParam = call.request.queryParameters["batch"] ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Batch required."))
                        val semParam = call.request.queryParameters["semester"]?.toIntOrNull() ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Semester required."))
                        val groupCodeParam = call.request.queryParameters["groupCode"]?.uppercase() ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Group code required."))

                        val principal = call.principal<JWTPrincipal>()
                        val adminDept = principal?.payload?.getClaim("department")?.asString() ?: "BCA"

                        val result = transaction {
                            Users.selectAll()
                                .where { (Users.batch eq batchParam) and (Users.department eq adminDept) and (Users.role eq "student") }
                                .map { row ->
                                    val reg = row[Users.registerNumber]
                                    val name = row[Users.name]

                                    val currentElective = StudentElectiveMappings.selectAll()
                                        .where {
                                            (StudentElectiveMappings.registerNumber eq reg) and
                                                    (StudentElectiveMappings.batch eq batchParam) and
                                                    (StudentElectiveMappings.semester eq semParam) and
                                                    (StudentElectiveMappings.groupCode eq groupCodeParam)
                                        }
                                        .map { it[StudentElectiveMappings.subjectCode] }
                                        .firstOrNull()

                                    StudentElectiveStatusDTO(
                                        registerNumber = reg,
                                        name = name,
                                        batch = batchParam,
                                        assignedSubjectCode = currentElective
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, result)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to fetch elective student list."))
                    }
                }

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
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to assign subject."))
                    }
                }

                post("/batches/assign-global-group") {
                    try {
                        val req = call.receive<AssignGlobalGroupRequest>()
                        val groupUpper = req.groupCode.trim().uppercase()

                        transaction {
                            val groupSubjects = Subjects.selectAll()
                                .where { (Subjects.groupCode eq groupUpper) and (Subjects.subjectType eq "GLOBAL") }
                                .map { it[Subjects.code] }

                            groupSubjects.forEach { code ->
                                BatchSubjects.insertIgnore {
                                    it[batch] = req.batch
                                    it[semester] = req.semester
                                    it[subjectCode] = code
                                    it[groupCode] = groupUpper
                                }
                            }
                        }

                        call.respond(HttpStatusCode.Created, ApiResponse("Global subject group linked to semester."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to assign global group."))
                    }
                }

                get("/assigned-subjects") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val adminDepartment = principal?.payload?.getClaim("department")?.asString()
                            ?: return@get call.respond(HttpStatusCode.Unauthorized, ApiResponse("Department missing from token payload."))

                        val assignedList = transaction {
                            BatchSubjects
                                .innerJoin(Subjects, { BatchSubjects.subjectCode }, { Subjects.code })
                                .innerJoin(Batches, { BatchSubjects.batch }, { Batches.batch })
                                .selectAll()
                                .where { Batches.department eq adminDepartment }
                                .map { row ->
                                    AssignedSubjectDTO(
                                        id = row[BatchSubjects.id],
                                        batch = row[BatchSubjects.batch],
                                        semester = row[BatchSubjects.semester],
                                        subjectCode = row[BatchSubjects.subjectCode],
                                        subjectName = row[Subjects.name],
                                        groupCode = row[BatchSubjects.groupCode],
                                        subjectType = row[Subjects.subjectType],
                                        department = row[Subjects.department]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, assignedList)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch assigned subjects."))
                    }
                }

                delete("/assigned-subjects/{id}") {
                    try {
                        val assignmentId = call.parameters["id"]?.toIntOrNull()
                            ?: return@delete call.respond(HttpStatusCode.BadRequest, ApiResponse("Valid assignment ID required."))

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
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to unlink subject."))
                    }
                }

                post("/assigned-groups/delete") {
                    try {
                        val req = call.receive<DeleteGroupMappingRequest>()
                        val batchVal = req.batch.trim()
                        val semVal = req.semester
                        val groupVal = req.groupCode.trim().uppercase()

                        val deletedRows = transaction {
                            BatchSubjects.deleteWhere {
                                (batch eq batchVal) and (semester eq semVal) and (groupCode eq groupVal)
                            }
                        }

                        call.respond(HttpStatusCode.OK, ApiResponse("Global subject group unlinked successfully ($deletedRows rows removed)."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse("Failed to unlink global group."))
                    }
                }

                get("/batches/{batch}/semester/{sem}/subjects") {
                    try {
                        val batchName = call.parameters["batch"]
                            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Batch param required."))
                        val semester = call.parameters["sem"]?.toIntOrNull()
                            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiResponse("Valid semester required."))

                        val subjects = transaction {
                            BatchSubjects
                                .innerJoin(Subjects, { BatchSubjects.subjectCode }, { Subjects.code })
                                .select(Subjects.id, Subjects.code, Subjects.name, Subjects.subjectType, Subjects.groupCode)
                                .where { (BatchSubjects.batch eq batchName) and (BatchSubjects.semester eq semester) }
                                .map { row ->
                                    SubjectResponse(
                                        id = row[Subjects.id],
                                        code = row[Subjects.code],
                                        name = row[Subjects.name],
                                        subjectType = row[Subjects.subjectType],
                                        groupCode = row[Subjects.groupCode]
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, subjects)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch semester subjects."))
                    }
                }

                get("/attendance-logs") {
                    try {
                        val principal = call.principal<JWTPrincipal>()
                        val rawDeptClaim = principal?.payload?.getClaim("department")?.asString() ?: ""
                        // Extracts "bca" from "bca@wmoig" or handles raw department string
                        val adminDepartment = rawDeptClaim.split("@").firstOrNull()?.trim()?.lowercase() ?: "bca"

                        val dateParam = call.request.queryParameters["date"]
                        val startDateParam = call.request.queryParameters["startDate"]
                        val endDateParam = call.request.queryParameters["endDate"]
                        val batchParam = call.request.queryParameters["batch"]
                        val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()
                        val subjectCodeParam = call.request.queryParameters["subjectCode"]
                        val hourParam = call.request.queryParameters["hour"]?.toIntOrNull()
                        val statusParam = call.request.queryParameters["status"]

                        val logs = transaction {
                            // 1. Use LEFT JOIN so logs are retained even if user table entry is missing/mismatched
                            var query = AttendanceRecords
                                .leftJoin(Users, { AttendanceRecords.registerNumber }, { Users.registerNumber })
                                .selectAll()

                            // 2. Department Filtering (Case-Insensitive)
                            if (adminDepartment.isNotBlank()) {
                                query = query.andWhere {
                                    AttendanceRecords.department.lowerCase() eq adminDepartment
                                }
                            }

                            // 3. Batch Filtering (Via Users table with Lowercase & Trim)
                            if (!batchParam.isNullOrBlank() && batchParam != "ALL") {
                                query = query.andWhere {
                                    Users.batch.trim().lowerCase() eq batchParam.trim().lowercase()
                                }
                            }

                            // 4. Semester Filtering (Via BatchSubjects mapped subject codes)
                            if (semesterParam != null) {
                                val semesterSubjectCodes = BatchSubjects
                                    .select(BatchSubjects.subjectCode)
                                    .where { BatchSubjects.semester eq semesterParam }
                                    .map { it[BatchSubjects.subjectCode] }

                                if (semesterSubjectCodes.isNotEmpty()) {
                                    query = query.andWhere { AttendanceRecords.subjectCode inList semesterSubjectCodes }
                                }
                            }

                            // 5. Single Date Filter
                            if (!dateParam.isNullOrBlank() && dateParam != "ALL") {
                                try {
                                    query = query.andWhere { AttendanceRecords.date eq LocalDate.parse(dateParam) }
                                } catch (_: Exception) {}
                            }

                            // 6. Date Range Filter
                            if (!startDateParam.isNullOrBlank()) {
                                try {
                                    query = query.andWhere { AttendanceRecords.date greaterEq LocalDate.parse(startDateParam) }
                                } catch (_: Exception) {}
                            }
                            if (!endDateParam.isNullOrBlank()) {
                                try {
                                    query = query.andWhere { AttendanceRecords.date lessEq LocalDate.parse(endDateParam) }
                                } catch (_: Exception) {}
                            }

                            // 7. Subject Code Filter
                            if (!subjectCodeParam.isNullOrBlank() && subjectCodeParam != "ALL") {
                                query = query.andWhere {
                                    AttendanceRecords.subjectCode.lowerCase() eq subjectCodeParam.lowercase()
                                }
                            }

                            // 8. Hour Filter
                            if (hourParam != null) {
                                query = query.andWhere { AttendanceRecords.hour eq hourParam }
                            }

                            // 9. Status Filter
                            if (!statusParam.isNullOrBlank() && statusParam != "ALL") {
                                query = query.andWhere {
                                    AttendanceRecords.status.lowerCase() eq statusParam.lowercase()
                                }
                            }

                            query.orderBy(
                                AttendanceRecords.registerNumber to SortOrder.ASC,
                                AttendanceRecords.date to SortOrder.DESC,
                                AttendanceRecords.hour to SortOrder.ASC
                            ).map { row ->
                                AttendanceLogResponse(
                                    id = row[AttendanceRecords.id],
                                    registerNumber = row[AttendanceRecords.registerNumber],
                                    name = row.getOrNull(Users.name) ?: row[AttendanceRecords.registerNumber],
                                    subjectCode = row[AttendanceRecords.subjectCode],
                                    subjectName = row[AttendanceRecords.subjectName] ?: row[AttendanceRecords.subjectCode], // <-- Map subjectName here
                                    hour = row[AttendanceRecords.hour],
                                    date = row[AttendanceRecords.date].toString(),
                                    status = row[AttendanceRecords.status]
                                )
                            }
                        }

                        call.respond(HttpStatusCode.OK, logs)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch attendance logs."))
                    }
                }

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

                get("/timetable") {
                    try {
                        val batchParam = call.request.queryParameters["batch"]
                        val semesterParam = call.request.queryParameters["semester"]?.toIntOrNull()
                        val dayParam = call.request.queryParameters["day"]

                        if (batchParam.isNullOrBlank() || semesterParam == null) {
                            call.respond(HttpStatusCode.BadRequest, ApiResponse("Batch and semester parameters are required."))
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
                                                subjectName = row.getOrNull(Subjects.name) ?: row[Timetables.subjectCode]
                                            )
                                        }
                                    )
                                }
                        }

                        call.respond(HttpStatusCode.OK, timetableDays)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to fetch timetable."))
                    }
                }

                post("/timetable") {
                    try {
                        val req = call.receive<SaveTimetableRequest>()

                        val (activeSubjects, activeGroupCodes) = transaction {
                            val rows = BatchSubjects
                                .selectAll()
                                .where { (BatchSubjects.batch eq req.batch) and (BatchSubjects.semester eq req.semester) }

                            val codes = rows.map { it[BatchSubjects.subjectCode] }.toSet()
                            val groups = rows.mapNotNull { it[BatchSubjects.groupCode] }.toSet()

                            Pair(codes, groups)
                        }

                        val invalidSlot = req.slots.firstOrNull {
                            val code = it.subjectCode
                            !code.isNullOrBlank() && !activeSubjects.contains(code) && !activeGroupCodes.contains(code)
                        }

                        if (invalidSlot != null) {
                            call.respond(HttpStatusCode.BadRequest, ApiResponse("Subject/Group ${invalidSlot.subjectCode} is not actively mapped to ${req.batch} Sem ${req.semester}."))
                            return@post
                        }

                        TimetableRepository.saveTimetableForDay(req)

                        call.respond(HttpStatusCode.OK, ApiResponse("Timetable updated successfully."))
                    } catch (e: Exception) {
                        e.printStackTrace()
                        call.respond(HttpStatusCode.InternalServerError, ApiResponse(e.message ?: "Failed to save timetable."))
                    }
                }

            }
        }
    }
}
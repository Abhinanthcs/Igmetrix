package com.attendance

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.date
import org.jetbrains.exposed.sql.ReferenceOption

object Admins : Table("admins") {
    val id = integer("id").autoIncrement()
    val department = varchar("department", 50).uniqueIndex()
    val password = varchar("password", 255)
    val role = varchar("role", 20)

    override val primaryKey = PrimaryKey(id)
}

object Teachers : Table("teachers") {
    val teacherId = varchar("teacher_id", 50)
    val name = varchar("name", 100)
    val dateOfBirth = date("date_of_birth")
    val phoneNumber = varchar("phone_number", 20).nullable()
    val department = varchar("department", 50)
    val password = varchar("password", 255)

    override val primaryKey = PrimaryKey(teacherId)
}

object Users : Table("users") {
    val id = integer("id").autoIncrement()
    val registerNumber = varchar("register_number", 50).uniqueIndex()
    val name = varchar("name", 100)
    val department = varchar("department", 50)
    val dateOfBirth = date("date_of_birth")
    val batch = varchar("batch", 20)
    val phoneNumber = varchar("phone_number", 20)
    val role = varchar("role", 20)
    val gender = varchar("gender", 20).nullable()
    val kreapPrn = varchar("kreap_prn", 50).nullable()
    val applicationNumber = varchar("application_number", 50).nullable()

    override val primaryKey = PrimaryKey(id)
}

object AttendanceRecords : Table("attendance_records") {
    val id = integer("id").autoIncrement()
    val registerNumber = varchar("register_number", 50)
    val subjectCode = varchar("subject_code", 20)
    val subjectName = varchar("subject_name", 100)
    val department = varchar("department", 50)
    val date = date("date")
    val hour = integer("hour")
    val status = varchar("status", 10)

    override val primaryKey = PrimaryKey(id)
}

object Batches : Table("batches") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).uniqueIndex()
    val department = varchar("department", 50)
    val studentCount = integer("student_count").default(0)

    override val primaryKey = PrimaryKey(id)
}

object Subjects : Table("subjects") {
    val id = integer("id").autoIncrement()
    val code = varchar("code", 20).uniqueIndex()
    val name = varchar("name", 100)
    val department = varchar("department", 50)
    val subjectType = varchar("subject_type", 255).default("LOCAL")
    val groupCode = varchar("group_code", 50).nullable()

    override val primaryKey = PrimaryKey(id)
}

object BatchSemesters : Table("batch_semesters") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).references(Batches.batch)
    val currentSemester = integer("current_semester")
    val department = varchar("department", 50)

    override val primaryKey = PrimaryKey(id)
}

// Maps individual students to their chosen elective subject within a group code slot
object StudentElectiveMappings : Table("student_elective_mappings") {
    val id = integer("id").autoIncrement()
    val registerNumber = varchar("register_number", 50).references(Users.registerNumber, onDelete = ReferenceOption.CASCADE)
    val batch = varchar("batch", 20).references(Batches.batch, onDelete = ReferenceOption.CASCADE)
    val semester = integer("semester")
    val groupCode = varchar("group_code", 50)
    val subjectCode = varchar("subject_code", 20).references(Subjects.code, onDelete = ReferenceOption.CASCADE)

    override val primaryKey = PrimaryKey(id)

    init {
        // Strict constraint: Single student choice per group slot in a batch/semester
        uniqueIndex("unique_student_group_slot", registerNumber, batch, semester, groupCode)
    }
}

object BatchSubjects : Table("batch_subjects") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).references(Batches.batch, onDelete = ReferenceOption.CASCADE)
    val semester = integer("semester")
    val subjectCode = varchar("subject_code", 20).references(Subjects.code, onDelete = ReferenceOption.CASCADE)
    val groupCode = varchar("group_code", 50).nullable()

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex("unique_batch_sem_subject", batch, semester, subjectCode)
    }
}

object Timetables : Table("timetables") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 30)
    val semester = integer("semester")
    val day = varchar("day", 15)
    val hour = integer("hour")
    val subjectCode = varchar("subject_code", 30).nullable()

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex(batch, semester, day, hour)
    }
}
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
// --- NEW DEDICATED TEACHERS TABLE ---
object Teachers : Table("teachers") {
    val teacherId = varchar("teacher_id", 50)
    val name = varchar("name", 100)
    val dateOfBirth = date("date_of_birth")
    val phoneNumber = varchar("phone_number", 20).nullable()
    val department = varchar("department", 50)

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
    val status = varchar("status", 2)

    override val primaryKey = PrimaryKey(id)
}

object Batches : Table("batches") {
    val id = integer("id").autoIncrement()
    // Add .unique() here
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

    override val primaryKey = PrimaryKey(id)
}

// 2. Tracks the active semester of each batch (e.g., Semester 1, 2, 3...)
object BatchSemesters : Table("batch_semesters") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).references(Batches.batch)
    val currentSemester = integer("current_semester")
    val department = varchar("department", 50)

    override val primaryKey = PrimaryKey(id)
}

// 3. Maps subjects to a batch for a specific semester
object BatchSubjects : Table("batch_subjects") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).references(Batches.batch, onDelete = ReferenceOption.CASCADE)
    val semester = integer("semester")
    val subjectCode = varchar("subject_code", 20).references(Subjects.code, onDelete = ReferenceOption.CASCADE)

    override val primaryKey = PrimaryKey(id)

    init {
        // Enforces unique assignment per batch, semester, and subject
        uniqueIndex("unique_batch_sem_subject", batch, semester, subjectCode)
    }
}
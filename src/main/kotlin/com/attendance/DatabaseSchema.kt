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

    init {
        index("idx_teachers_dept", false, department)
    }
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

    init {
        // High-frequency lookup indexes
        index("idx_users_dept_role_batch", false, department, role, batch)
        index("idx_users_reg_dept", false, registerNumber, department)
    }
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

    init {
        // Critical indexes to resolve sequential table scans
        index("idx_att_reg_status", false, registerNumber, status)
        index("idx_att_reg_subj", false, registerNumber, subjectCode)
        index("idx_att_dept_date_hour", false, department, date, hour)
        index("idx_att_date_hour_subj", false, date, hour, subjectCode)
    }
}

object Batches : Table("batches") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).uniqueIndex()
    val department = varchar("department", 50)
    val studentCount = integer("student_count").default(0)

    override val primaryKey = PrimaryKey(id)

    init {
        index("idx_batches_dept", false, department)
    }
}

object Subjects : Table("subjects") {
    val id = integer("id").autoIncrement()
    val code = varchar("code", 20).uniqueIndex()
    val name = varchar("name", 100)
    val department = varchar("department", 50)
    val subjectType = varchar("subject_type", 255).default("LOCAL")
    val groupCode = varchar("group_code", 50).nullable()

    override val primaryKey = PrimaryKey(id)

    init {
        index("idx_subjects_dept_type", false, department, subjectType)
    }
}

object BatchSemesters : Table("batch_semesters") {
    val id = integer("id").autoIncrement()
    val batch = varchar("batch", 20).references(Batches.batch)
    val currentSemester = integer("current_semester")
    val department = varchar("department", 50)

    override val primaryKey = PrimaryKey(id)
}

object StudentElectiveMappings : Table("student_elective_mappings") {
    val id = integer("id").autoIncrement()
    val registerNumber = varchar("register_number", 50).references(Users.registerNumber, onDelete = ReferenceOption.CASCADE)
    val batch = varchar("batch", 20).references(Batches.batch, onDelete = ReferenceOption.CASCADE)
    val semester = integer("semester")
    val groupCode = varchar("group_code", 50)
    val subjectCode = varchar("subject_code", 20).references(Subjects.code, onDelete = ReferenceOption.CASCADE)

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex("unique_student_group_slot", registerNumber, batch, semester, groupCode)
        index("idx_elective_lookup", false, batch, semester, groupCode, subjectCode)
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
        index("idx_batch_sem", false, batch, semester)
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
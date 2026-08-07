package com.attendance

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    fun init() {
        Database.connect(
            url = "jdbc:postgresql://localhost:5432/attendance_db",
            driver = "org.postgresql.Driver",
            user = "postgres",
            password = "2248" // Replace with the password you set when installing PostgreSQL
        )

        transaction {
            SchemaUtils.create(
                Teachers,
                Users,
                AttendanceRecords,
                Batches,
                Subjects,
                BatchSubjects
            )
        }
    }
}
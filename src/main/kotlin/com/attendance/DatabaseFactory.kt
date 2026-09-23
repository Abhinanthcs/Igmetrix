package com.attendance

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    fun init() {
        var dbUrl = System.getenv("DATABASE_URL")
            ?: "jdbc:postgresql://localhost:5432/attendance_db"
        val dbUser = System.getenv("DATABASE_USER")
            ?: "postgres"
        val dbPassword = System.getenv("DATABASE_PASSWORD")
            ?: "9g45ta@Xp"

        // Append sslmode=disable if not already explicitly specified
        if (!dbUrl.contains("sslmode")) {
            dbUrl = if (dbUrl.contains("?")) "$dbUrl&sslmode=disable" else "$dbUrl?sslmode=disable"
        }

        Database.connect(
            url = dbUrl,
            driver = "org.postgresql.Driver",
            user = dbUser,
            password = dbPassword
        )

        transaction {
            SchemaUtils.create(
                Teachers,
                Users,
                AttendanceRecords,
                Batches,
                Subjects,
                Timetables,
                BatchSubjects,
                StudentElectiveMappings
            )
        }
    }
}
package com.attendance

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    fun init() {
        val baseUrl = System.getenv("DATABASE_URL")
            ?: "jdbc:postgresql://localhost:5432/attendance_db"
        val dbUser = System.getenv("DATABASE_USER")
            ?: "postgres"
        val dbPassword = System.getenv("DATABASE_PASSWORD")
            ?: "9g45ta@Xp"

        // Append SSL and connection parameters to the JDBC URL string
        val dbUrl = if (baseUrl.contains("?")) {
            "$baseUrl&sslmode=disable&ssl=false"
        } else {
            "$baseUrl?sslmode=disable&ssl=false"
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
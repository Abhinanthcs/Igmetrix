package com.attendance

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    fun init() {
        val database = Database.connect(createHikariDataSource())

        transaction(database) {
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

    private fun createHikariDataSource(): HikariDataSource {
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

        val config = HikariConfig().apply {
            driverClassName = "org.postgresql.Driver"
            jdbcUrl = dbUrl
            username = dbUser
            password = dbPassword

            // HikariCP Performance & Stability Configs
            maximumPoolSize = 10
            isAutoCommit = false
            transactionIsolation = "TRANSACTION_REPEATABLE_READ"
            validate()
        }

        return HikariDataSource(config)
    }
}
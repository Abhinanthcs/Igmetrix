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

        // Append SSL parameters if they aren't present
        val dbUrl = if (baseUrl.contains("sslmode=")) {
            baseUrl
        } else if (baseUrl.contains("?")) {
            "$baseUrl&sslmode=disable&ssl=false"
        } else {
            "$baseUrl?sslmode=disable&ssl=false"
        }

        val config = HikariConfig().apply {
            driverClassName = "org.postgresql.Driver"
            jdbcUrl = dbUrl
            username = dbUser
            password = dbPassword

            // Pool Sizing
            maximumPoolSize = 10
            minimumIdle = 10 // Fixed pool size keeps connections warm across bore tunnel

            // Transaction Defaults
            isAutoCommit = false
            transactionIsolation = "TRANSACTION_READ_COMMITTED" // PostgreSQL default (lower overhead)

            // Tunnel Resilience & Keep-Alives
            keepaliveTime = 30000 // 30s TCP heartbeat prevents bore tunnel timeout
            maxLifetime = 1800000 // 30 minutes max age per connection
            connectionTimeout = 10000 // Fail fast (10s) instead of hanging the UI for 30s
            validationTimeout = 3000 // 3s validation check timeout

            // PostgreSQL Performance Driver Options
            addDataSourceProperty("reWriteBatchedInserts", "true")
            addDataSourceProperty("cachePrepStmts", "true")
            addDataSourceProperty("prepStmtCacheSize", "250")
            addDataSourceProperty("prepStmtCacheSqlLimit", "2048")
        }

        return HikariDataSource(config)
    }
}
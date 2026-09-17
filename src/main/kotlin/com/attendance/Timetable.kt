package com.attendance

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert


object TimetableRepository {

    fun getTimetableForDay(batchVal: String, semVal: Int, dayVal: String): List<TimetableSlotResponse> {
        return transaction {
            Timetables
                .leftJoin(Subjects, { Timetables.subjectCode }, { Subjects.code })
                .selectAll()
                .where {
                    (Timetables.batch eq batchVal) and
                            (Timetables.semester eq semVal) and
                            (Timetables.day eq dayVal)
                }
                .orderBy(Timetables.hour to SortOrder.ASC)
                .map { row ->
                    TimetableSlotResponse(
                        hour = row[Timetables.hour],
                        subjectCode = row[Timetables.subjectCode],
                        subjectName = row.getOrNull(Subjects.name)
                    )
                }
        }
    }

    fun saveTimetableForDay(req: SaveTimetableRequest) {
        transaction {
            // 1. Delete existing slots for this specific batch, semester, and day
            Timetables.deleteWhere {
                (Timetables.batch eq req.batch) and
                        (Timetables.semester eq req.semester) and
                        (Timetables.day eq req.day)
            }

            // 2. Insert the updated slots
            req.slots.forEach { slot ->
                if (!slot.subjectCode.isNullOrBlank()) {
                    Timetables.insert {
                        it[batch] = req.batch
                        it[semester] = req.semester
                        it[day] = req.day
                        it[hour] = slot.hour
                        it[subjectCode] = slot.subjectCode
                    }
                }
            }
        }
    }
}
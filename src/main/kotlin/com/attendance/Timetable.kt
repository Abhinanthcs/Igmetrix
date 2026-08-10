package com.attendance

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction

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
            Timetables.deleteWhere {
                (Timetables.batch eq req.batch) and
                        (Timetables.semester eq req.semester) and
                        (Timetables.day eq req.day)
            }

            req.slots.forEach { slot ->
                if (!slot.subjectCode.isNullOrBlank()) {
                    Timetables.insert {
                        it[Timetables.batch] = req.batch
                        it[Timetables.semester] = req.semester
                        it[Timetables.day] = req.day
                        it[Timetables.hour] = slot.hour
                        it[Timetables.subjectCode] = slot.subjectCode
                    }
                }
            }
        }
    }
}
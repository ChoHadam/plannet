package com.hadam.plannet.storage

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

internal val fixtureMapper = JsonMapper.builder().build()
internal const val FIXTURE_TIME = "2026-09-26T12:00:00.000Z"

internal fun fixture(kind: String, id: String = "plan-1"): JsonNode {
    val common = mutableMapOf<String, Any>(
        "id" to id, "template" to kind, "title" to "계획", "category" to "daily",
        "year" to 2026, "month" to 9, "day" to 26,
        "createdAt" to FIXTURE_TIME, "updatedAt" to FIXTURE_TIME,
    )
    val todo = mapOf("id" to "todo-1", "text" to "할 일", "completed" to false)
    when (kind) {
        "daily" -> common.putAll(mapOf("todos" to listOf(todo + mapOf(
            "sourceType" to "mandalart", "sourceId" to "missing-source", "sourceCellId" to "top-left-1",
        )), "memo" to "메모"))
        "monthly" -> common.putAll(mapOf(
            "goals" to listOf(todo + mapOf("progress" to 12.5, "sourceMandalartId" to "missing-source", "sourceCellId" to "top-left-1")),
            "weeklyFocus" to (1..5).map { mapOf("weekNumber" to it, "text" to "포커스 $it") }, "memo" to "메모",
        ))
        "mandalart" -> common["grids"] = listOf("top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right").map { grid ->
            mapOf("id" to grid, "color" to "#fff", "cells" to (0..8).map { cell -> mapOf(
                "id" to "$grid-$cell", "position" to cell, "value" to "목표 $cell", "completed" to false,
                "schedule" to mapOf("targetMonths" to listOf(9, 10), "startDate" to "2026-09-01", "endDate" to "2026-10-31", "repeat" to "weekly", "repeatDays" to listOf(1, 3)),
            ) })
        }
        "block6" -> common.putAll(mapOf(
            "blocks" to listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun").flatMap { day -> (1..6).map { number ->
                mapOf("id" to "$day-$number", "day" to day, "blockNumber" to number, "keyword" to "", "todos" to emptyList<Any>())
            } }, "backlog" to listOf(todo + mapOf("color" to "gray")),
        ))
        "recurring" -> return fixtureMapper.valueToTree(mapOf("todos" to listOf(mapOf("id" to "recurring-1", "text" to "루틴", "color" to "blue", "createdAt" to FIXTURE_TIME))))
        "holidays" -> return fixtureMapper.valueToTree(mapOf("manualHolidays" to mapOf("2026-09-26" to mapOf("date" to "2026-09-26", "name" to "쉬는 날", "createdAt" to FIXTURE_TIME))))
    }
    return fixtureMapper.valueToTree(common)
}

internal fun change(kind: String = "daily", id: String = "plan-1", version: Long = 0, data: JsonNode? = fixture(kind, id)): JsonNode =
    fixtureMapper.valueToTree(mapOf("kind" to kind, "id" to id, "schemaVersion" to 1, "expectedVersion" to version, "data" to data))

internal fun commitJson(changes: List<JsonNode>, requestId: UUID = UUID.randomUUID()): JsonNode =
    fixtureMapper.valueToTree(mapOf("requestId" to requestId.toString(), "changes" to changes))

internal fun bytes(node: JsonNode): ByteArray = fixtureMapper.writeValueAsBytes(node)

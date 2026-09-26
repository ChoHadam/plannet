package com.hadam.plannet.storage

import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.ObjectNode
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals

class PlannerValidatorTests {
    private val validator = PlannerValidator()
    private fun rejected(node: JsonNode, status: Int = 400) = assertEquals(status,
        assertFailsWith<PlannerException> { validator.parse(bytes(node)) }.status)

    @Test
    fun `all current template fields and safe extensions round trip`() {
        val changes = PlannerLimits.KINDS.map { kind ->
            val id = if (kind in setOf("recurring", "holidays")) "default" else "same-id"
            val data = fixture(kind, id) as ObjectNode
            data.set("future", fixtureMapper.readTree("""{"label":"보존","values":[true,3,null]}"""))
            change(kind, id, data = data)
        }
        val parsed = validator.parse(bytes(commitJson(changes)))
        assertEquals(changes.map { it["data"] }, parsed.changes.map { it.data })
    }

    @Test
    fun `malformed ids versions dates fields and nested todo types are rejected`() {
        val invalid = listOf(
            "id" to fixtureMapper.readTree("\"../owner\""),
            "expectedVersion" to fixtureMapper.readTree("1.5"),
            "schemaVersion" to fixtureMapper.readTree("2"),
            "kind" to fixtureMapper.readTree("\"foreign\""),
        )
        invalid.forEach { (key, value) ->
            val item = change() as ObjectNode
            item.set(key, value)
            rejected(commitJson(listOf(item)))
        }
        listOf("title", "category", "template", "createdAt", "memo", "todos").forEach { key ->
            val data = fixture("daily") as ObjectNode
            data.remove(key)
            rejected(commitJson(listOf(change(data = data))))
        }
        val invalidDate = fixture("daily") as ObjectNode
        invalidDate.put("month", 2).put("day", 30)
        rejected(commitJson(listOf(change(data = invalidDate))))
        val invalidTodo = fixture("daily")
        (invalidTodo["todos"][0] as ObjectNode).put("completed", "false")
        rejected(commitJson(listOf(change(data = invalidTodo))))
    }

    @Test
    fun `schedules require real ordered dates bounded unique months and days`() {
        listOf(
            """{"repeat":"yearly"}""", """{"targetMonths":[0]}""", """{"targetMonths":[1,1]}""",
            """{"repeatDays":[7]}""", """{"repeatDays":[1,1]}""", """{"startDate":"2026-02-30"}""",
            """{"startDate":"2026-10-01","endDate":"2026-09-01"}""",
        ).forEach { schedule ->
            val data = fixture("mandalart")
            (data["grids"][0]["cells"][0] as ObjectNode).set("schedule", fixtureMapper.readTree(schedule))
            rejected(commitJson(listOf(change("mandalart", data = data))))
        }
    }

    @Test
    fun `duplicates forged owner fields and unsafe extensions are rejected`() {
        val item = change()
        rejected(commitJson(listOf(item, item)))
        val foreignOwner = commitJson(listOf(item)) as ObjectNode
        foreignOwner.put("userId", "forged")
        rejected(foreignOwner)
        listOf("__proto__", "constructor", "prototype").forEach { key ->
            val data = fixture("daily") as ObjectNode
            data.putObject("future").put(key, "unsafe")
            rejected(commitJson(listOf(change(data = data))))
        }
        val data = fixture("daily") as ObjectNode
        data.put("memo", "NUL\u0000")
        rejected(commitJson(listOf(change(data = data))))
    }

    @Test
    fun `counts strings data body and nesting are bounded`() {
        rejected(commitJson((0..100).map { change(id = "plan-$it") }))
        val longText = fixture("daily") as ObjectNode
        longText.put("memo", "x".repeat(PlannerLimits.TEXT_LENGTH + 1))
        rejected(commitJson(listOf(change(data = longText))))
        val large = fixture("daily") as ObjectNode
        large.set("future", fixtureMapper.valueToTree(List(140) { "x".repeat(PlannerLimits.TEXT_LENGTH) }))
        rejected(commitJson(listOf(change(data = large))), 413)
        assertEquals(413, assertFailsWith<PlannerException> { validator.parse(ByteArray(PlannerLimits.BODY_BYTES + 1)) }.status)
        val deep = fixture("daily") as ObjectNode
        var child = deep
        repeat(14) { child = child.putObject("future") }
        rejected(commitJson(listOf(change(data = deep))))
    }

    @Test
    fun `malformed duplicate and trailing JSON documents are rejected`() {
        listOf("", "{}{}", "{", """{"requestId":"a","requestId":"b","changes":[]}""").forEach { raw ->
            assertEquals(400, assertFailsWith<PlannerException> { validator.parse(raw.toByteArray()) }.status)
        }
    }

    @Test
    fun `idempotency hash ignores object property order but detects changed content`() {
        val first = commitJson(listOf(change())) as ObjectNode
        val reordered = fixtureMapper.createObjectNode().set("changes", first["changes"]).set("requestId", first["requestId"])
        assertEquals(validator.parse(bytes(first)).hash, validator.parse(bytes(reordered)).hash)
        val changed = first.deepCopy() as ObjectNode
        (changed["changes"][0]["data"] as ObjectNode).put("title", "다른 계획")
        assertNotEquals(validator.parse(bytes(first)).hash, validator.parse(bytes(changed)).hash)
    }
}

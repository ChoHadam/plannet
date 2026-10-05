package com.hadam.plannet.storage

import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.core.json.JsonFactory
import tools.jackson.core.StreamReadConstraints
import tools.jackson.core.StreamReadFeature
import tools.jackson.databind.JsonNode
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.UUID

/** Validate the current template shapes while retaining bounded, safe extension fields verbatim. */
@Component
class PlannerValidator {
    private val mapper = JsonMapper.builder(JsonFactory.builder()
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32).build())
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build())
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build()
    private val idPattern = Regex("^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$")
    private val uuidPattern = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val datePattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val colorPattern = Regex("^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$")
    private val forbiddenKeys = setOf("__proto__", "prototype", "constructor")
    private val categories = setOf("annual", "monthly", "weekly", "daily")
    private val days = setOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    /** Monthly weeklyFocus 개수: 이전 플랜 5(W1~W5), 6주인 달을 지원하는 6(W1~W6) */
    private val weeklyFocusCounts = setOf(5, 6)
    private val maxWeeklyFocus = weeklyFocusCounts.max()
    private val positions = setOf("top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right")
    private val todoColors = setOf("none", "red", "orange", "yellow", "green", "blue", "purple", "pink", "gray")

    fun parse(bytes: ByteArray): PlannerCommit {
        if (bytes.size > PlannerLimits.BODY_BYTES) throw PlannerException(413, "payload_too_large")
        val root = try {
            mapper.readTree(bytes)
        } catch (_: JacksonException) {
            throw PlannerException(400, "invalid_request")
        }
        obj(root)
        valid(root.propertyNames().toSet() == setOf("requestId", "changes"))
        val requestId = text(root["requestId"], 36)
        valid(uuidPattern.matches(requestId))
        val changes = array(root["changes"], PlannerLimits.CHANGES)
        valid(changes.isNotEmpty())
        val parsed = changes.map { change ->
            obj(change)
            valid(change.propertyNames().toSet() == setOf("kind", "id", "schemaVersion", "expectedVersion", "data"))
            val kind = enum(change["kind"], PlannerLimits.KINDS)
            val id = id(change["id"])
            if (kind == "recurring" || kind == "holidays") valid(id == "default")
            integer(change["schemaVersion"], 1, 1)
            val version = integer(change["expectedVersion"], 0, PlannerLimits.MAX_VERSION)
            val data = change["data"].takeUnless { it.isNull }
            data?.let {
                if (mapper.writeValueAsBytes(it).size > PlannerLimits.DATA_BYTES) {
                    throw PlannerException(413, "payload_too_large")
                }
                tree(it)
                validateData(kind, id, it)
            }
            PlannerChange(kind, id, version, data)
        }
        valid(parsed.map { it.kind to it.id }.toSet().size == parsed.size)
        val hash = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical(root)))
            .joinToString("") { "%02x".format(it) }
        return PlannerCommit(UUID.fromString(requestId), parsed, hash)
    }

    private fun validateData(kind: String, recordId: String, data: JsonNode) {
        obj(data)
        when (kind) {
            "recurring" -> {
                val todos = array(data["todos"], PlannerLimits.ITEMS)
                uniqueIds(todos)
                todos.forEach { todo ->
                    obj(todo); id(todo["id"]); text(todo["text"]); timestamp(todo["createdAt"])
                    optional(todo, "color") { enum(it, todoColors) }
                }
            }
            "holidays" -> {
                val holidays = obj(data["manualHolidays"])
                valid(holidays.size() <= PlannerLimits.HOLIDAYS)
                holidays.properties().forEach { (key, holiday) ->
                    date(key); obj(holiday)
                    valid(text(holiday["date"], 10) == key)
                    timestamp(holiday["createdAt"])
                    optional(holiday, "name") { text(it) }
                }
            }
            else -> {
                valid(id(data["id"]) == recordId)
                valid(text(data["template"]) == kind)
                text(data["title"]); enum(data["category"], categories)
                timestamp(data["createdAt"]); timestamp(data["updatedAt"])
                period(data, kind)
                when (kind) {
                    "daily" -> {
                        text(data["memo"])
                        val todos = array(data["todos"], PlannerLimits.ITEMS)
                        uniqueIds(todos)
                        todos.forEach { todo ->
                            todo(todo)
                            optional(todo, "sourceType") { enum(it, setOf("monthly", "block6", "mandalart")) }
                            optional(todo, "sourceId") { id(it) }
                            optional(todo, "sourceCellId") { id(it) }
                        }
                    }
                    "monthly" -> monthly(data)
                    "block6" -> block6(data)
                    "mandalart" -> mandalart(data)
                }
            }
        }
    }

    private fun period(data: JsonNode, kind: String) {
        if (kind in setOf("daily", "monthly")) {
            valid(data.has("year") && data.has("month"))
        }
        if (kind == "daily") valid(data.has("day"))
        optional(data, "year") { integer(it, 1, 9999) }
        optional(data, "month") { integer(it, 1, 12) }
        optional(data, "week") { integer(it, 1, 53) }
        optional(data, "day") { integer(it, 1, 31) }
        if (data.has("month") && data.has("day")) {
            val year = if (data.has("year")) data["year"].intValue() else 2000
            try {
                LocalDate.of(year, data["month"].intValue(), data["day"].intValue())
            } catch (_: java.time.DateTimeException) { valid(false) }
        }
    }

    private fun monthly(data: JsonNode) {
        text(data["memo"])
        val goals = array(data["goals"], PlannerLimits.ITEMS)
        uniqueIds(goals)
        goals.forEach { goal ->
            todo(goal)
            val progress = goal["progress"]
            valid(progress != null && progress.isNumber && progress.doubleValue().isFinite() && progress.doubleValue() in 0.0..100.0)
            optional(goal, "sourceMandalartId") { id(it) }
            optional(goal, "sourceCellId") { id(it) }
        }
        // 이전 플랜 W1~W5 또는 W6 포함 W1~W6: 번호가 1..개수를 빠짐·중복 없이 한 번씩(순서 무관)
        val focus = array(data["weeklyFocus"], maxWeeklyFocus)
        valid(focus.size in weeklyFocusCounts)
        val weeks = focus.map {
            obj(it); text(it["text"]); integer(it["weekNumber"], 1, focus.size.toLong())
        }
        valid(weeks.toSet().size == focus.size)
    }

    private fun block6(data: JsonNode) {
        val blocks = array(data["blocks"], 42)
        valid(blocks.size == 42)
        uniqueIds(blocks)
        val coordinates = blocks.map { block ->
            obj(block)
            val day = enum(block["day"], days)
            val number = integer(block["blockNumber"], 1, 6)
            valid(id(block["id"]) == "$day-$number")
            text(block["keyword"])
            optional(block, "color") { color(it) }
            day to number
        }
        valid(coordinates.toSet().size == 42)
        val todos = blocks.flatMap { array(it["todos"], PlannerLimits.ITEMS) } + array(data["backlog"], PlannerLimits.ITEMS)
        valid(todos.size <= PlannerLimits.HOLIDAYS)
        uniqueIds(todos)
        todos.forEach { todo ->
            todo(todo)
            optional(todo, "color") { enum(it, todoColors) }
        }
    }

    private fun mandalart(data: JsonNode) {
        val grids = array(data["grids"], 9)
        valid(grids.size == 9)
        uniqueIds(grids)
        grids.forEach { grid ->
            obj(grid)
            val gridId = enum(grid["id"], positions)
            color(grid["color"])
            val cells = array(grid["cells"], 9)
            valid(cells.size == 9)
            val cellPositions = cells.map { cell ->
                obj(cell)
                val position = integer(cell["position"], 0, 8)
                valid(id(cell["id"]) == "$gridId-$position")
                text(cell["value"])
                optional(cell, "completed") { bool(it) }
                optional(cell, "isDaily") { bool(it) }
                optional(cell, "icon") { text(it, PlannerLimits.ID_LENGTH) }
                optional(cell, "schedule") { schedule(it) }
                position
            }
            valid(cellPositions.toSet().size == 9)
        }
    }

    private fun schedule(schedule: JsonNode) {
        obj(schedule)
        optional(schedule, "targetMonths") { numberList(it, 1, 12) }
        optional(schedule, "repeatDays") { numberList(it, 0, 6) }
        optional(schedule, "repeat") { enum(it, setOf("daily", "weekly", "monthly")) }
        optional(schedule, "startDate") { date(text(it, 10)) }
        optional(schedule, "endDate") { date(text(it, 10)) }
        if (schedule.has("startDate") && schedule.has("endDate")) {
            valid(schedule["startDate"].asString() <= schedule["endDate"].asString())
        }
    }

    private fun numberList(node: JsonNode, min: Long, max: Long) {
        val items = array(node, (max - min + 1).toInt()).map { integer(it, min, max) }
        valid(items.toSet().size == items.size)
    }

    private fun todo(node: JsonNode) {
        obj(node); id(node["id"]); text(node["text"]); bool(node["completed"])
    }

    private fun tree(node: JsonNode, depth: Int = 0) {
        valid(depth <= PlannerLimits.DEPTH)
        when {
            node.isObject -> {
                valid(node.size() <= PlannerLimits.HOLIDAYS)
                node.properties().forEach { (key, value) ->
                    valid(key !in forbiddenKeys && key.length <= PlannerLimits.ID_LENGTH && '\u0000' !in key)
                    tree(value, depth + 1)
                }
            }
            node.isArray -> {
                valid(node.size() <= PlannerLimits.HOLIDAYS)
                node.forEach { tree(it, depth + 1) }
            }
            node.isString -> text(node)
            node.isNumber -> valid(node.doubleValue().isFinite())
        }
    }

    private fun canonical(node: JsonNode): JsonNode = when {
        node.isObject -> mapper.createObjectNode().also { result ->
            node.properties().sortedBy { it.key }.forEach { (key, value) -> result.set(key, canonical(value)) }
        }
        node.isArray -> mapper.createArrayNode().also { result -> node.forEach { result.add(canonical(it)) } }
        else -> node
    }

    private fun uniqueIds(nodes: List<JsonNode>) = valid(nodes.map { obj(it); id(it["id"]) }.toSet().size == nodes.size)
    private fun obj(node: JsonNode?): JsonNode { valid(node != null && node.isObject); return node!! }
    private fun array(node: JsonNode?, max: Int): List<JsonNode> {
        valid(node != null && node.isArray && node.size() <= max)
        return node!!.toList()
    }
    private fun text(node: JsonNode?, max: Int = PlannerLimits.TEXT_LENGTH): String {
        valid(node != null && node.isString)
        val value = node!!.asString()
        valid(value.length <= max && '\u0000' !in value)
        return value
    }
    private fun id(node: JsonNode?): String = text(node, PlannerLimits.ID_LENGTH).also { valid(idPattern.matches(it)) }
    private fun bool(node: JsonNode?) = valid(node != null && node.isBoolean)
    private fun integer(node: JsonNode?, min: Long, max: Long): Long {
        valid(node != null && node.isIntegralNumber && node.canConvertToLong())
        return node!!.longValue().also { valid(it in min..max) }
    }
    private fun enum(node: JsonNode?, allowed: Set<String>): String = text(node).also { valid(it in allowed) }
    private fun color(node: JsonNode?) = valid(colorPattern.matches(text(node, 9)))
    private fun optional(node: JsonNode, key: String, validate: (JsonNode) -> Unit) {
        if (node.has(key)) validate(node[key])
    }
    private fun date(value: String) {
        valid(datePattern.matches(value))
        try {
            valid(LocalDate.parse(value).year in 1..9999)
        } catch (_: DateTimeParseException) { valid(false) }
    }
    private fun timestamp(node: JsonNode?) {
        val value = text(node, 40)
        try {
            val timestamp = OffsetDateTime.parse(value)
            valid(timestamp.year in 1..9999)
        } catch (_: DateTimeParseException) { valid(false) }
    }
}

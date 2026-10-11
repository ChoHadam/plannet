package com.hadam.plannet.storage

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIf
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.ObjectNode
import java.io.File
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Monthly W1~W5 / W1~W6 on real PostgreSQL through the HTTP API.
 * PLANNET_REQUIRE_POSTGRES=true makes a missing/unreachable DB a failure instead of a skip.
 */
@EnabledIf("com.hadam.plannet.storage.PlannerMonthlyWeeksPostgresTests#postgresRequested")
@SpringBootTest(properties = [
    "plannet.storage.enabled=true",
    "plannet.auth.google.client-id=storage-test-client",
    "plannet.auth.google.client-secret=storage-test-secret",
])
@AutoConfigureMockMvc
class PlannerMonthlyWeeksPostgresTests @Autowired constructor(
    private val mvc: MockMvc,
    private val registrations: ClientRegistrationRepository,
    dataSource: DataSource,
) {
    private val jdbc = JdbcTemplate(dataSource)

    private fun login(subject: String) = oidcLogin()
        .clientRegistration(registrations.findByRegistrationId("google"))
        .idToken { it.subject(subject).claim("email", "w6-same-email@example.test") }

    private fun userId(subject: String): String =
        json(mvc.perform(get("/api/v1/me").with(login(subject))).andReturn())["user"]["userId"].asString()

    private fun read(subject: String, header: String): MvcResult =
        mvc.perform(get("/api/v1/planner").with(login(subject)).header(PlannerController.ACCOUNT_HEADER, header)).andReturn()

    private fun write(subject: String, header: String, request: JsonNode): MvcResult = mvc.perform(
        post("/api/v1/planner/commit").with(login(subject)).with(csrf()).header(PlannerController.ACCOUNT_HEADER, header)
            .contentType(MediaType.APPLICATION_JSON).content(bytes(request)),
    ).andReturn()

    private fun json(result: MvcResult, status: Int = 200): JsonNode {
        assertEquals(status, result.response.status, result.response.contentAsString)
        return fixtureMapper.readTree(result.response.contentAsString)
    }

    private fun record(snapshot: JsonNode, id: String) = snapshot["records"].single { it["kind"].asString() == "monthly" && it["id"].asString() == id }

    private fun monthly(id: String, year: Int, month: Int, focus: List<Pair<Int, String>>): JsonNode =
        (fixture("monthly", id) as ObjectNode).apply {
            put("title", "월간 W6 검증 $id")
            put("category", "monthly")
            put("year", year)
            put("month", month)
            put("day", 1)
            set("weeklyFocus", fixtureMapper.valueToTree(focus.map { (week, text) -> mapOf("weekNumber" to week, "text" to text) }))
        }

    @Test
    fun `legacy W1-W5 and Korean W1-W6 survive real PostgreSQL requery month changes and stay account isolated`() {
        val alice = "w6-alice-${UUID.randomUUID()}"
        val bob = "w6-bob-${UUID.randomUUID()}"
        val aliceId = userId(alice)
        val bobId = userId(bob)
        assertNotEquals(aliceId, bobId)
        val replays = mutableListOf<Map<String, Any>>()
        fun commit(subject: String, header: String, changes: List<JsonNode>): JsonNode {
            val request = commitJson(changes)
            val response = json(write(subject, header, request))
            replays += mapOf("subject" to subject, "request" to request, "response" to response)
            return response
        }

        // Legacy 5-entry plan: stored and requeried byte-equal, never padded to 6.
        val legacy = monthly("legacy-w5", 2026, 9, (1..5).map { it to "이전 포커스 W$it" })
        commit(alice, aliceId, listOf(change("monthly", "legacy-w5", 0, legacy)))
        assertEquals(legacy, record(json(read(alice, aliceId)), "legacy-w5")["data"])

        // Moving the legacy plan to a 6-week month keeps exactly its 5 entries.
        val legacyMarch = (legacy.deepCopy() as ObjectNode).put("month", 3)
        commit(alice, aliceId, listOf(change("monthly", "legacy-w5", 1, legacyMarch)))
        val legacySaved = record(json(read(alice, aliceId)), "legacy-w5")
        assertEquals(legacyMarch, legacySaved["data"])
        assertEquals(5, legacySaved["data"]["weeklyFocus"].size())
        assertEquals(2, legacySaved["version"].intValue())

        // W1~W6 Korean text (unordered) in a 6-week month (2026-03).
        val focus = listOf(6 to "여섯째 주: 3월 30~31일 마감 정리 ✅", 1 to "첫째 주 — 목표 세우기", 2 to "둘째 주 루틴",
            3 to "셋째 주 회고", 4 to "넷째 주 집중", 5 to "다섯째 주 \"따옴표\"·줄\n바꿈")
        val sixWeeks = monthly("w6-plan", 2026, 3, focus)
        commit(alice, aliceId, listOf(change("monthly", "w6-plan", 0, sixWeeks)))
        assertEquals(sixWeeks, record(json(read(alice, aliceId)), "w6-plan")["data"])

        // 6-week → 4-week (2027-02) → 5-week (2026-10) → back to 6-week: W5/W6 text is never dropped.
        listOf(2027 to 2, 2026 to 10, 2026 to 3).forEachIndexed { index, (year, month) ->
            val moved = (sixWeeks.deepCopy() as ObjectNode).put("year", year).put("month", month)
            commit(alice, aliceId, listOf(change("monthly", "w6-plan", index + 1L, moved)))
            val saved = record(json(read(alice, aliceId)), "w6-plan")
            assertEquals(moved, saved["data"])
            assertEquals(sixWeeks["weeklyFocus"], saved["data"]["weeklyFocus"])
            assertEquals(index + 2, saved["version"].intValue())
        }

        // Bob uses the same record id with his own W6 text; neither account sees the other.
        val bobPlan = monthly("w6-plan", 2026, 3, (1..6).map { it to "밥의 주간 포커스 W$it" })
        commit(bob, bobId, listOf(change("monthly", "w6-plan", 0, bobPlan)))
        val aliceSnapshot = json(read(alice, aliceId))
        val bobSnapshot = json(read(bob, bobId))
        assertEquals(aliceId, aliceSnapshot["userId"].asString())
        assertEquals(listOf("legacy-w5", "w6-plan"), aliceSnapshot["records"].toList().map { it["id"].asString() })
        assertEquals(listOf("w6-plan"), bobSnapshot["records"].toList().map { it["id"].asString() })
        assertEquals(bobPlan, record(bobSnapshot, "w6-plan")["data"])
        assertEquals(1, record(bobSnapshot, "w6-plan")["version"].intValue())
        assertTrue("밥의" !in aliceSnapshot.toString() && "여섯째" !in bobSnapshot.toString())
        assertEquals("account_changed", json(read(bob, aliceId), 409)["error"].asString())
        assertEquals("account_changed", json(write(bob, aliceId, commitJson(listOf(change("monthly", "w6-plan", 4, sixWeeks)))), 409)["error"].asString())
        assertEquals(aliceSnapshot, json(read(alice, aliceId)))

        System.getenv("PLANNET_W6_MANIFEST")?.let { path ->
            val manifest = mapOf(
                "owners" to listOf(alice to aliceSnapshot, bob to bobSnapshot).map { (subject, snapshot) ->
                    mapOf("subject" to subject, "userId" to snapshot["userId"].asString(), "snapshot" to snapshot,
                        "etag" to read(subject, snapshot["userId"].asString()).response.getHeader("ETag"))
                },
                "replays" to replays,
            )
            File(path).writeText(fixtureMapper.writerWithDefaultPrettyPrinter().writeValueAsString(manifest))
        }
    }

    @Test
    fun `invalid weekly focus shapes are rejected on the real storage path without writing`() {
        val subject = "w6-invalid-${UUID.randomUUID()}"
        val id = userId(subject)
        listOf(
            (1..7).map { it to "W$it" },
            (1..5).map { it to "W$it" } + (7 to "W7"),
            (1..5).map { it to "W$it" } + (5 to "중복"),
            (1..4).map { it to "W$it" },
        ).forEach { focus ->
            val request = commitJson(listOf(change("monthly", "bad", 0, monthly("bad", 2026, 3, focus))))
            assertEquals("invalid_request", json(write(subject, id, request), 400)["error"].asString(), focus.toString())
        }
        assertEquals(0, json(read(subject, id))["records"].size())
    }

    /** Second phase: the same API reads a database restored by infra/storage/manage.py. */
    @Test
    @EnabledIfEnvironmentVariable(named = "PLANNET_W6_RESTORED_MANIFEST", matches = ".+")
    fun `restored database serves identical owners records versions and replayed receipts through the API`() {
        val manifest = fixtureMapper.readTree(File(System.getenv("PLANNET_W6_RESTORED_MANIFEST")).readText())
        assertEquals(2, manifest["owners"].size())
        manifest["owners"].forEach { owner ->
            val subject = owner["subject"].asString()
            val expectedId = owner["userId"].asString()
            // The restored identity row must exist before the API could create one.
            assertEquals(expectedId, jdbc.queryForObject("SELECT id::text FROM plannet_user WHERE provider = 'google' AND subject = ?", String::class.java, subject))
            assertEquals(expectedId, userId(subject))
            val restored = read(subject, expectedId)
            assertEquals(owner["snapshot"], json(restored))
            assertEquals(owner["etag"].asString(), restored.response.getHeader("ETag"))
        }
        // Receipts restored: every original request replays its original ACK and writes nothing.
        manifest["replays"].forEach { replay ->
            val subject = replay["subject"].asString()
            val ownerId = manifest["owners"].single { it["subject"].asString() == subject }["userId"].asString()
            assertEquals(replay["response"], json(write(subject, ownerId, replay["request"])))
        }
        manifest["owners"].forEach { owner ->
            assertEquals(owner["snapshot"], json(read(owner["subject"].asString(), owner["userId"].asString())))
        }
    }

    companion object {
        @JvmStatic
        fun postgresRequested() = !System.getenv("PLANNET_TEST_DB_URL").isNullOrBlank() ||
            System.getenv("PLANNET_REQUIRE_POSTGRES") == "true"

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            registry.add("plannet.storage.url") { requireNotNull(System.getenv("PLANNET_TEST_DB_URL")) { "PLANNET_TEST_DB_URL is required" } }
            registry.add("plannet.storage.username") { System.getenv("PLANNET_TEST_DB_USERNAME") }
            registry.add("plannet.storage.password") { System.getenv("PLANNET_TEST_DB_PASSWORD") }
        }
    }
}

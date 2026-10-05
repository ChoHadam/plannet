package com.hadam.plannet.storage

import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.dao.DataIntegrityViolationException
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
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** Opt in with a disposable, real PostgreSQL database. No embedded DB or persistence mocks. */
@EnabledIfEnvironmentVariable(named = "PLANNET_TEST_DB_URL", matches = "jdbc:postgresql:.*")
@SpringBootTest(properties = [
    "plannet.storage.enabled=true",
    "plannet.auth.google.client-id=storage-test-client",
    "plannet.auth.google.client-secret=storage-test-secret",
])
@AutoConfigureMockMvc
class PlannerPostgresTests @Autowired constructor(
    private val mvc: MockMvc,
    private val storage: PlannerStorage,
    private val validator: PlannerValidator,
    private val registrations: ClientRegistrationRepository,
    private val dataSource: HikariDataSource,
) {
    private val jdbc = JdbcTemplate(dataSource)
    private data class Owner(val subject: String, val id: UUID)
    private fun owner(): Owner {
        val subject = "storage-test-${UUID.randomUUID()}"
        return Owner(subject, storage.resolveUser("google", subject))
    }
    private fun login(owner: Owner) = oidcLogin()
        .clientRegistration(registrations.findByRegistrationId("google"))
        .idToken { it.subject(owner.subject).claim("email", "same-email@example.test") }
    private fun read(owner: Owner, header: String? = owner.id.toString()): MvcResult {
        val request = get("/api/v1/planner").with(login(owner))
        header?.let { request.header(PlannerController.ACCOUNT_HEADER, it) }
        return mvc.perform(request).andReturn()
    }
    private fun write(owner: Owner, requestBody: JsonNode, header: String? = owner.id.toString(), withCsrf: Boolean = true): MvcResult {
        val request = post("/api/v1/planner/commit").with(login(owner)).contentType(MediaType.APPLICATION_JSON).content(bytes(requestBody))
        if (withCsrf) request.with(csrf())
        header?.let { request.header(PlannerController.ACCOUNT_HEADER, it) }
        return mvc.perform(request).andReturn()
    }
    private fun result(result: MvcResult, status: Int = 200): JsonNode {
        assertEquals(status, result.response.status, result.response.contentAsString)
        assertTrue(result.response.getHeader("Cache-Control")!!.contains("no-store"))
        return fixtureMapper.readTree(result.response.contentAsString)
    }
    private fun parsed(node: JsonNode) = validator.parse(bytes(node))

    @Test
    fun `migration and all six kinds preserve full content source references and relational metadata`() {
        val owner = owner()
        val changes = PlannerLimits.KINDS.map { kind ->
            val id = if (kind in setOf("recurring", "holidays")) "default" else "same-id"
            change(kind, id)
        }
        val response = result(write(owner, commitJson(changes)))
        assertEquals(6, response["records"].size())
        val snapshot = result(read(owner))
        assertEquals(owner.id.toString(), snapshot["userId"].asString())
        changes.forEach { original ->
            val saved = snapshot["records"].single { it["kind"] == original["kind"] }
            assertEquals(original["data"], saved["data"])
            assertEquals(1, saved["version"].intValue())
            assertEquals(false, saved["deleted"].booleanValue())
        }
        assertEquals(4L, jdbc.queryForObject("SELECT count(*) FROM planner_record WHERE user_id = ? AND title = ? AND category = ? AND plan_year = ? AND plan_month = ? AND plan_day = ?", Long::class.java,
            owner.id, "계획", "daily", 2026, 9, 26))
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Long::class.java)!! >= 1)
    }

    @Test
    fun `me exposes stable internal identity and never keys accounts by email`() {
        val alice = owner()
        val bob = owner()
        val a = result(mvc.perform(get("/api/v1/me").with(login(alice))).andReturn())
        val b = result(mvc.perform(get("/api/v1/me").with(login(bob))).andReturn())
        assertTrue(a["storageEnabled"].booleanValue())
        assertEquals(alice.id.toString(), a["user"]["userId"].asString())
        assertNotEquals(a["user"]["userId"], b["user"]["userId"])
        assertEquals(alice.id, storage.resolveUser("google", alice.subject))
        assertNotEquals(alice.id, storage.resolveUser("other-provider", alice.subject))
    }

    @Test
    fun `owner isolation same record ids and expected account preconditions apply to reads and writes`() {
        val alice = owner()
        val bob = owner()
        val request = commitJson(listOf(change()))
        result(write(alice, request))
        assertEquals(0, result(read(bob))["records"].size())
        listOf(null, alice.id.toString(), UUID.randomUUID().toString(), "malformed").forEach { staleId ->
            assertEquals("account_changed", result(read(bob, staleId), 409)["error"].asString())
            assertEquals("account_changed", result(write(bob, request, staleId), 409)["error"].asString())
        }
        assertEquals(0, storage.snapshot(bob.id).records.size)
        // Another owner can use the same record id and request id without reading Alice's receipt.
        result(write(bob, request))
        assertEquals(1, storage.snapshot(bob.id).records.single().version)
        assertEquals(1, storage.snapshot(alice.id).records.single().version)
    }

    @Test
    fun `authentication csrf and request envelope errors never write records`() {
        val owner = owner()
        val request = commitJson(listOf(change()))
        assertEquals(401, mvc.perform(get("/api/v1/planner")).andReturn().response.status)
        assertEquals(401, mvc.perform(post("/api/v1/planner/commit").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(bytes(request))).andReturn().response.status)
        assertEquals("csrf_invalid", result(write(owner, request, withCsrf = false), 403)["error"].asString())
        val forged = request.deepCopy() as ObjectNode
        forged.put("userId", UUID.randomUUID().toString())
        assertEquals("invalid_request", result(write(owner, forged), 400)["error"].asString())
        assertEquals(0, storage.snapshot(owner.id).records.size)
    }

    @Test
    fun `a successful retry is returned before version checks and altered reuse conflicts`() {
        val owner = owner()
        val request = commitJson(listOf(change()))
        val original = result(write(owner, request))
        result(write(owner, commitJson(listOf(change(version = 1)))))
        assertEquals(original, result(write(owner, request)))
        val altered = request.deepCopy() as ObjectNode
        (altered["changes"][0]["data"] as ObjectNode).put("title", "변경")
        assertEquals("idempotency_conflict", result(write(owner, altered), 409)["error"].asString())
        assertEquals(2, storage.snapshot(owner.id).records.single().version)
    }

    @Test
    fun `stale batch conflicts are atomic and failed request ids can be corrected`() {
        val owner = owner()
        result(write(owner, commitJson(listOf(change()))))
        val requestId = UUID.randomUUID()
        val stale = commitJson(listOf(change(id = "new-plan"), change()), requestId)
        val error = result(write(owner, stale), 409)
        assertEquals("version_conflict", error["error"].asString())
        assertEquals(1, error["conflicts"][0]["actualVersion"].intValue())
        assertEquals(1, storage.snapshot(owner.id).records.size)
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM planner_commit_receipt WHERE user_id = ? AND request_id = ?", Long::class.java, owner.id, requestId))
        result(write(owner, commitJson(listOf(change(id = "new-plan"), change(version = 1)), requestId)))
        assertEquals(2, storage.snapshot(owner.id).records.size)
    }

    @Test
    fun `database failure on a later write rolls back earlier records and receipt`() {
        val owner = owner()
        val request = parsed(commitJson(listOf(change(id = "first"), change(id = "second"))))
        // Inject a database check failure after the first SQL write; HTTP normally rejects this earlier.
        val brokenData = request.changes[1].data!!.deepCopy() as ObjectNode
        brokenData.put("category", "invalid-category")
        val broken = request.copy(changes = listOf(request.changes[0], request.changes[1].copy(data = brokenData)))
        assertFailsWith<DataIntegrityViolationException> { storage.commit(owner.id, broken) }
        assertEquals(0, storage.snapshot(owner.id).records.size)
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM planner_commit_receipt WHERE user_id = ? AND request_id = ?", Long::class.java, owner.id, request.requestId))
        assertEquals(2, storage.commit(owner.id, request).records.size)
    }

    @Test
    fun `tombstones survive reads block stale resurrection and can be intentionally restored`() {
        val owner = owner()
        result(write(owner, commitJson(listOf(change()))))
        val deleted = result(write(owner, commitJson(listOf(change(version = 1, data = null)))))["records"][0]
        assertTrue(deleted["deleted"].booleanValue())
        assertTrue(deleted["data"].isNull)
        assertEquals(2, result(read(owner))["records"][0]["version"].intValue())
        assertEquals(409, write(owner, commitJson(listOf(change(version = 1)))).response.status)
        result(write(owner, commitJson(listOf(change(version = 2)))))
        assertEquals(3, storage.snapshot(owner.id).records.single().version)
    }

    @Test
    fun `concurrent first identity mapping creates exactly one internal user`() {
        val subject = "concurrent-${UUID.randomUUID()}"
        val ids = parallel(16) { storage.resolveUser("google", subject) }
        assertEquals(1, ids.toSet().size)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM plannet_user WHERE provider = ? AND subject = ?", Long::class.java, "google", subject))
    }

    @Test
    fun `concurrent first saves have one winner and duplicate requests have one durable receipt`() {
        val owner = owner()
        val requests = (0..1).map { parsed(commitJson(listOf(change()))) }
        val outcomes = parallel(2) { index ->
            try { storage.commit(owner.id, requests[index]); "saved" } catch (error: PlannerException) { error.code }
        }
        assertEquals(setOf("saved", "version_conflict"), outcomes.toSet())
        val retryOwner = owner()
        val request = parsed(commitJson(listOf(change())))
        val responses = parallel(8) { storage.commit(retryOwner.id, request) }
        assertEquals(1, responses.toSet().size)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM planner_commit_receipt WHERE user_id = ?", Long::class.java, retryOwner.id))
        assertEquals(1, storage.snapshot(retryOwner.id).records.single().version)
    }

    @Test
    fun `oversized content length is rejected before parsing`() {
        val owner = owner()
        val request = post("/api/v1/planner/commit").with(login(owner)).with(csrf())
            .header(PlannerController.ACCOUNT_HEADER, owner.id.toString())
            .contentType(MediaType.APPLICATION_JSON).content(ByteArray(PlannerLimits.BODY_BYTES + 1) { ' '.code.toByte() })
        assertEquals("payload_too_large", result(mvc.perform(request).andReturn(), 413)["error"].asString())
        assertEquals(0, storage.snapshot(owner.id).records.size)
    }

    // ---- metadata-only commit receipts (V3) ----

    private fun receipt(owner: Owner, requestId: String): String = jdbc.queryForObject(
        "SELECT response::text FROM planner_commit_receipt WHERE user_id = ? AND request_id = ?::uuid",
        String::class.java, owner.id, requestId,
    )!!

    @Test
    fun `receipts keep metadata only and a replay rebuilds the original ACK even after later edits and deletion`() {
        val owner = owner()
        val request = commitJson(listOf(change(), change(kind = "mandalart", id = "goal")))
        val requestId = request["requestId"].asString()
        val original = result(write(owner, request))
        val stored = fixtureMapper.readTree(receipt(owner, requestId))
        assertEquals(2, stored["format"].intValue())
        assertEquals(listOf("plan-1", "goal"), stored["records"].toList().map { it["id"].asString() })
        stored["records"].forEach { assertTrue(it["data"] == null, it.toString()); assertTrue(it.has("updatedAt")) }
        assertTrue(receipt(owner, requestId).length < 600, "receipt must not carry plan bodies")

        // Later edit and deletion of the same records: the replay must still be the original ACK, not current data.
        result(write(owner, commitJson(listOf(change(version = 1, data = (fixture("daily") as ObjectNode).put("title", "나중 수정"))))))
        result(write(owner, commitJson(listOf(change(kind = "mandalart", id = "goal", version = 1, data = null)))))
        assertEquals(original, result(write(owner, request)))
        // A hash-identical request with different key order replays canonically too.
        val reordered = fixtureMapper.readTree("""{"changes":${fixtureMapper.writeValueAsString(request["changes"])},"requestId":"$requestId"}""")
        assertEquals(original, result(write(owner, reordered)))
        assertEquals(2L, jdbc.queryForObject("SELECT version FROM planner_record WHERE user_id = ? AND id = 'plan-1'", Long::class.java, owner.id))
    }

    @Test
    fun `a receipt that does not describe the retried changes is refused instead of returned`() {
        val owner = owner()
        val request = commitJson(listOf(change()))
        val requestId = request["requestId"].asString()
        result(write(owner, request))
        // The schema itself refuses plan data inside a receipt.
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.update("UPDATE planner_commit_receipt SET response = jsonb_set(response, '{records,0,data}', '{}') WHERE user_id = ?", owner.id)
        }
        // SQL CHECK normally accepts NULL: missing/null format or records must be rejected explicitly.
        listOf("{}", "null", """{"format":2}""", """{"records":[]}""", """{"format":null,"records":[]}""",
            """{"format":"2","records":[]}""").forEach { invalid ->
            assertFailsWith<DataIntegrityViolationException> {
                jdbc.update("UPDATE planner_commit_receipt SET response = ?::jsonb WHERE user_id = ?", invalid, owner.id)
            }
        }
        jdbc.update(
            "UPDATE planner_commit_receipt SET response = jsonb_set(response, '{records,0,version}', '7') WHERE user_id = ? AND request_id = ?::uuid",
            owner.id, requestId,
        )
        assertEquals("idempotency_conflict", result(write(owner, request), 409)["error"].asString())
        jdbc.update(
            "UPDATE planner_commit_receipt SET response = jsonb_set(response, '{records}', '[]') WHERE user_id = ? AND request_id = ?::uuid",
            owner.id, requestId,
        )
        assertEquals("idempotency_conflict", result(write(owner, request), 409)["error"].asString())
    }

    @Test
    fun `the V3 migration strips only record data from legacy receipts and the result still replays`() {
        val owner = owner()
        val request = commitJson(listOf(change(), change(id = "second", data = null)))
        val requestId = request["requestId"].asString()
        val original = result(write(owner, request))
        // Upgrade an isolated, populated V2 schema through Flyway, including the V3 constraint.
        val legacy = fixtureMapper.writeValueAsString(original)
        val schema = "receipt_upgrade_${UUID.randomUUID().toString().replace("-", "") }"
        val migrated = try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("2").load().migrate()
            jdbc.update("INSERT INTO $schema.plannet_user (id, provider, subject) VALUES (?, 'google', ?)", owner.id, owner.subject)
            jdbc.update("INSERT INTO $schema.planner_record SELECT * FROM planner_record WHERE user_id = ?", owner.id)
            jdbc.update("INSERT INTO $schema.planner_commit_receipt (user_id, request_id, request_hash, response) VALUES (?, ?::uuid, ?, ?::jsonb)",
                owner.id, requestId, parsed(request).hash, legacy)
            val before = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(r) ORDER BY kind, id)::text FROM $schema.planner_record r", String::class.java)
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate()
            assertEquals(before, jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(r) ORDER BY kind, id)::text FROM $schema.planner_record r", String::class.java))
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM $schema.flyway_schema_history WHERE version = '3' AND success", Long::class.java))
            assertFailsWith<DataIntegrityViolationException> {
                jdbc.update("UPDATE $schema.planner_commit_receipt SET response = '{}'::jsonb")
            }
            jdbc.queryForObject("SELECT response::text FROM $schema.planner_commit_receipt", String::class.java)!!
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS $schema CASCADE")
        }
        val node = fixtureMapper.readTree(migrated)
        assertEquals(2, node["format"].intValue())
        assertEquals(listOf("plan-1", "second"), node["records"].toList().map { it["id"].asString() })
        node["records"].toList().zip(original["records"].toList()).forEach { (after, before) ->
            assertTrue(after["data"] == null)
            listOf("kind", "id", "schemaVersion", "version", "deleted", "updatedAt").forEach { assertEquals(before[it], after[it], it) }
        }
        // Put the migrated body in place of the real receipt: the retry replays the original ACK.
        jdbc.update("UPDATE planner_commit_receipt SET response = ?::jsonb WHERE user_id = ? AND request_id = ?::uuid", migrated, owner.id, requestId)
        assertEquals(original, result(write(owner, request)))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version = '3' AND success", Long::class.java))
    }

    // ---- conditional snapshot ----

    private fun conditional(owner: Owner, vararg ifNoneMatch: String, header: String? = owner.id.toString()): MvcResult {
        val request = get("/api/v1/planner").with(login(owner))
        header?.let { request.header(PlannerController.ACCOUNT_HEADER, it) }
        ifNoneMatch.forEach { request.header("If-None-Match", it) }
        return mvc.perform(request).andReturn()
    }

    @Test
    fun `unchanged snapshot returns 304 without a body and any commit invalidates the etag`() {
        val owner = owner()
        val empty = read(owner)
        val emptyTag = empty.response.getHeader("ETag")!!
        assertTrue(emptyTag.startsWith("W/\"ps1-"))
        assertEquals("no-store", empty.response.getHeader("Cache-Control"))
        assertNotEquals(emptyTag, read(owner()).response.getHeader("ETag"), "empty accounts have distinct etags")

        val notModified = conditional(owner, emptyTag)
        assertEquals(304, notModified.response.status)
        assertEquals("", notModified.response.contentAsString)
        assertEquals(emptyTag, notModified.response.getHeader("ETag"))
        assertEquals("no-store", notModified.response.getHeader("Cache-Control"))
        assertEquals(304, conditional(owner, "\"other\", ${emptyTag.removePrefix("W/")}").response.status)

        val tags = mutableListOf(emptyTag)
        listOf(change(), change(version = 1, data = null), change(version = 2)).forEach { next ->
            result(write(owner, commitJson(listOf(next))))
            val fresh = conditional(owner, tags.last())
            assertEquals(200, fresh.response.status)
            val tag = fresh.response.getHeader("ETag")!!
            assertTrue(tag !in tags, "create/delete/restore must each change the etag")
            assertEquals(tag, snapshotEtag(owner.id, storage.snapshot(owner.id).records.map { RecordMetadata.of(it) }))
            tags += tag
        }
        // Wildcard or garbage never yields 304.
        listOf("*", "W/*", "garbage").forEach { assertEquals(200, conditional(owner, it).response.status, it) }
    }

    @Test
    fun `only the authenticated owner with the matching account header can get a 304`() {
        val alice = owner()
        val bob = owner()
        result(write(alice, commitJson(listOf(change()))))
        val aliceTag = read(alice).response.getHeader("ETag")!!
        assertEquals(200, conditional(bob, aliceTag).response.status)
        assertEquals(401, mvc.perform(get("/api/v1/planner").header("If-None-Match", aliceTag)).andReturn().response.status)
        assertEquals(409, conditional(bob, aliceTag, header = alice.id.toString()).response.status)
        assertEquals(409, conditional(alice, aliceTag, header = null).response.status)
    }

    @Test
    fun `concurrent commits never produce a snapshot whose etag describes a different generation`() {
        val owner = owner()
        result(write(owner, commitJson(listOf(change(id = "p0")))))
        val outcomes = parallel(6) { index ->
            if (index < 2) {
                (1..10).forEach { round ->
                    storage.commit(owner.id, parsed(commitJson(listOf(change(id = "w$index-$round")))))
                }
                emptyList()
            } else {
                (1..20).map {
                    val read = storage.conditionalSnapshot(owner.id, emptyList())
                    read.etag to snapshotEtag(owner.id, read.snapshot!!.records.map { record -> RecordMetadata.of(record) })
                }
            }
        }
        outcomes.flatten().forEach { (etag, recomputed) -> assertEquals(recomputed, etag) }
        assertEquals(21, storage.snapshot(owner.id).records.size)
    }

    private fun <T> parallel(count: Int, action: (Int) -> T): List<T> {
        val executor = Executors.newFixedThreadPool(count)
        val ready = CountDownLatch(1)
        try {
            val futures = (0 until count).map { index -> executor.submit(Callable { ready.await(); action(index) }) }
            ready.countDown()
            return futures.map { it.get(30, TimeUnit.SECONDS) }
        } finally { executor.shutdownNow() }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            registry.add("plannet.storage.url") { System.getenv("PLANNET_TEST_DB_URL") }
            registry.add("plannet.storage.username") { System.getenv("PLANNET_TEST_DB_USERNAME") }
            registry.add("plannet.storage.password") { System.getenv("PLANNET_TEST_DB_PASSWORD") }
        }
    }
}

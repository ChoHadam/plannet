package com.hadam.plannet.storage

import com.zaxxer.hikari.HikariDataSource
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
    dataSource: HikariDataSource,
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

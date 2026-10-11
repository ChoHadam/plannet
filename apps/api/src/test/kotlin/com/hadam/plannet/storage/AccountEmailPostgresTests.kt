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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import tools.jackson.databind.JsonNode
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

/** Verified Google email as mutable account metadata on real PostgreSQL. Identity stays (provider, subject). */
@EnabledIfEnvironmentVariable(named = "PLANNET_TEST_DB_URL", matches = "jdbc:postgresql:.*")
@SpringBootTest(properties = [
    "plannet.storage.enabled=true",
    "plannet.auth.google.client-id=storage-test-client",
    "plannet.auth.google.client-secret=storage-test-secret",
])
@AutoConfigureMockMvc
class AccountEmailPostgresTests @Autowired constructor(
    private val mvc: MockMvc,
    private val storage: PlannerStorage,
    private val registrations: ClientRegistrationRepository,
    private val dataSource: HikariDataSource,
) {
    private val jdbc = JdbcTemplate(dataSource)

    private fun subject() = "email-test-${UUID.randomUUID()}"
    private fun address() = "user-${UUID.randomUUID()}@example.test"

    /** Claims of a validated ID token; `null` leaves a claim out entirely. */
    private fun login(subject: String, email: String?, verified: Any? = true) = oidcLogin()
        .clientRegistration(registrations.findByRegistrationId("google"))
        .idToken { token ->
            token.subject(subject)
            email?.let { token.claim("email", it) }
            verified?.let { token.claim("email_verified", it) }
        }

    private fun me(subject: String, email: String?, verified: Any? = true): JsonNode {
        val response = mvc.perform(get("/api/v1/me").with(login(subject, email, verified))).andReturn().response
        assertEquals(200, response.status, response.contentAsString)
        return fixtureMapper.readTree(response.contentAsString)
    }

    private fun meId(subject: String, email: String?, verified: Any? = true) =
        UUID.fromString(me(subject, email, verified)["user"]["userId"].asString())

    private fun plannerGet(subject: String, id: UUID, email: String?, verified: Any? = true): JsonNode {
        val response = mvc.perform(get("/api/v1/planner").with(login(subject, email, verified))
            .header(PlannerController.ACCOUNT_HEADER, id.toString())).andReturn().response
        assertEquals(200, response.status, response.contentAsString)
        return fixtureMapper.readTree(response.contentAsString)
    }

    private fun commit(subject: String, id: UUID, email: String?, body: JsonNode) {
        val response = mvc.perform(post("/api/v1/planner/commit").with(login(subject, email)).with(csrf())
            .header(PlannerController.ACCOUNT_HEADER, id.toString())
            .contentType(MediaType.APPLICATION_JSON).content(bytes(body))).andReturn().response
        assertEquals(200, response.status, response.contentAsString)
    }

    private fun storedEmail(id: UUID): String? =
        jdbc.queryForObject("SELECT email FROM plannet_user WHERE id = ?", String::class.java, id)

    /** Row version: changes on every UPDATE, so equality proves no write happened. */
    private fun rowVersion(id: UUID): String =
        jdbc.queryForObject("SELECT xmin::text FROM plannet_user WHERE id = ?", String::class.java, id)!!

    private fun userCount(): Long = jdbc.queryForObject("SELECT count(*) FROM plannet_user", Long::class.java)!!

    @Test
    fun `V4 upgrades a populated V3 schema without touching users plans or receipts and leaves email null`() {
        val subjects = listOf(subject(), subject())
        val owners = subjects.map { subject -> subject to storage.resolveUser("google", subject) }
        owners.forEachIndexed { index, (subject, id) ->
            commit(subject, id, null, commitJson(listOf(change(), change("monthly", "month-$index"), change("recurring", "default"))))
        }
        val schema = "email_upgrade_${UUID.randomUUID().toString().replace("-", "")}"
        fun flyway(target: String? = null) = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
            .apply { target?.let { target(it) } }.load()
        fun fingerprint(table: String, order: String, exclude: String = "") = jdbc.queryForObject(
            "SELECT jsonb_agg(to_jsonb(t) $exclude ORDER BY $order)::text FROM $schema.$table t", String::class.java)
        try {
            flyway("3").migrate()
            val ids = owners.map { it.second }
            ids.forEach { id ->
                jdbc.update("INSERT INTO $schema.plannet_user SELECT id, provider, subject, created_at FROM plannet_user WHERE id = ?", id)
                jdbc.update("INSERT INTO $schema.planner_record SELECT * FROM planner_record WHERE user_id = ?", id)
                jdbc.update("INSERT INTO $schema.planner_commit_receipt SELECT * FROM planner_commit_receipt WHERE user_id = ?", id)
            }
            val users = fingerprint("plannet_user", "id")
            val records = fingerprint("planner_record", "user_id, kind, id")
            val receipts = fingerprint("planner_commit_receipt", "user_id, request_id")
            assertEquals(6L, jdbc.queryForObject("SELECT count(*) FROM $schema.planner_record", Long::class.java))
            assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM $schema.planner_commit_receipt", Long::class.java))

            assertEquals(1, flyway().migrate().migrationsExecuted)
            assertEquals(users, fingerprint("plannet_user", "id", "- 'email'"))
            assertEquals(records, fingerprint("planner_record", "user_id, kind, id"))
            assertEquals(receipts, fingerprint("planner_commit_receipt", "user_id, request_id"))
            assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM $schema.plannet_user WHERE email IS NULL", Long::class.java))
            assertEquals("YES|320", jdbc.queryForObject(
                "SELECT is_nullable || '|' || character_maximum_length FROM information_schema.columns WHERE table_schema = ? AND table_name = 'plannet_user' AND column_name = 'email'",
                String::class.java, schema))
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM $schema.flyway_schema_history WHERE version = '4' AND success", Long::class.java))
            // Database defense in depth: no whitespace/control or second '@'; the same address on two accounts is allowed.
            listOf("bad address@example.test", "a@b@example.test", "noat").forEach { bad ->
                assertFailsWith<DataIntegrityViolationException>(bad) {
                    jdbc.update("UPDATE $schema.plannet_user SET email = ? WHERE id = ?", bad, ids[0])
                }
            }
            assertEquals(2, jdbc.update("UPDATE $schema.plannet_user SET email = 'shared@example.test'"))
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS $schema CASCADE")
        }
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version = '4' AND success", Long::class.java))
    }

    @Test
    fun `first verified login stores the email and a changed email keeps the same account and plans`() {
        val subject = subject()
        val first = address()
        val id = meId(subject, first)
        assertEquals(first, storedEmail(id))
        commit(subject, id, first, commitJson(listOf(change())))

        val changed = address()
        assertEquals(id, meId(subject, changed))
        assertEquals(changed, storedEmail(id))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM plannet_user WHERE provider = 'google' AND subject = ?", Long::class.java, subject))
        val snapshot = plannerGet(subject, id, changed)
        assertEquals(listOf("plan-1"), snapshot["records"].toList().map { it["id"].asString() })
    }

    @Test
    fun `existing null account learns its email through authenticated planner resolution`() {
        val subject = subject()
        val id = storage.resolveUser("google", subject)
        assertNull(storedEmail(id))
        val email = address()
        plannerGet(subject, id, email)
        assertEquals(email, storedEmail(id))
    }

    @Test
    fun `the same email on different subjects stays two separate accounts`() {
        val shared = address()
        val alice = subject()
        val bob = subject()
        val aliceId = meId(alice, shared)
        val bobId = meId(bob, shared)
        assertNotEquals(aliceId, bobId)
        assertEquals(shared, storedEmail(aliceId))
        assertEquals(shared, storedEmail(bobId))
        commit(alice, aliceId, shared, commitJson(listOf(change())))
        assertEquals(0, plannerGet(bob, bobId, shared)["records"].size())
        assertEquals(1, plannerGet(alice, aliceId, shared)["records"].size())
    }

    @Test
    fun `missing unverified or invalid claims keep the known email and never break login`() {
        val subject = subject()
        val known = address()
        val id = meId(subject, known)
        val version = rowVersion(id)
        val attempts: List<Pair<String?, Any?>> = listOf(
            address() to null,              // email_verified absent
            address() to false,
            address() to "true",           // not a Boolean
            null to true,                   // email absent
            "bad address@example.test" to true,
            "control\u0000@example.test" to true,
            "a".repeat(64) + "@" + "b".repeat(300) to true,
        )
        attempts.forEach { (email, verified) ->
            assertEquals(id, meId(subject, email, verified), "$email/$verified")
            plannerGet(subject, id, email, verified)
        }
        assertEquals(known, storedEmail(id))
        assertEquals(version, rowVersion(id))

        // A brand-new account with an unusable claim still logs in, with a null profile email.
        val fresh = meId(subject(), "bad address@example.test")
        assertNull(storedEmail(fresh))
    }

    @Test
    fun `unchanged profile reads do not rewrite the account row`() {
        val subject = subject()
        val email = address()
        val id = meId(subject, email)
        val version = rowVersion(id)
        repeat(3) {
            meId(subject, email)
            plannerGet(subject, id, email)
        }
        assertEquals(version, rowVersion(id))
        assertEquals(id, storage.resolveUser("google", subject))
        assertEquals(version, rowVersion(id))
    }

    @Test
    fun `anonymous requests write no account`() {
        val before = userCount()
        assertEquals(401, mvc.perform(get("/api/v1/me")).andReturn().response.status)
        assertEquals(401, mvc.perform(get("/api/v1/planner")
            .header(PlannerController.ACCOUNT_HEADER, UUID.randomUUID().toString())).andReturn().response.status)
        assertEquals(before, userCount())
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

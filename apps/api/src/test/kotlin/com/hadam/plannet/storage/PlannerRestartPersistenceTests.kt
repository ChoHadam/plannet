package com.hadam.plannet.storage

import com.hadam.plannet.PlannetApiApplication
import com.hadam.plannet.auth.HttpTestClient
import com.hadam.plannet.auth.MockOidcProvider
import com.hadam.plannet.auth.location
import com.hadam.plannet.auth.queryParams
import com.hadam.plannet.auth.sessionId
import com.zaxxer.hikari.HikariDataSource
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.context.ConfigurableApplicationContext
import tools.jackson.databind.JsonNode
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@EnabledIfEnvironmentVariable(named = "PLANNET_TEST_DB_URL", matches = "jdbc:postgresql:.*")
class PlannerRestartPersistenceTests {
    private val clientId = "restart-storage-client"

    @Test
    fun `actual API restart preserves identity records tombstones and receipts while sessions expire and outages fail closed`() {
        MockOidcProvider(clientId).use { provider ->
            val subject = "restart-${UUID.randomUUID()}"
            val request = commitJson(listOf(change(), change(id = "deleted-plan", data = null)))
            lateinit var expected: JsonNode
            lateinit var userId: String
            lateinit var session: String
            start(provider).use { context ->
                val browser = browser(context)
                session = login(browser, provider, subject)
                val me = fixtureMapper.readTree(browser.get("/api/v1/me", session).body())
                assertTrue(me["storageEnabled"].booleanValue())
                userId = me["user"]["userId"].asString()
                val saved = browser.post("/api/v1/planner/commit", session, headers(browser, session, userId), request.toString())
                assertEquals(200, saved.statusCode(), saved.body())
                expected = fixtureMapper.readTree(saved.body())
            }
            start(provider).use { context ->
                val browser = browser(context)
                assertEquals(401, browser.get("/api/v1/me", session).statusCode())
                session = login(browser, provider, subject)
                val me = fixtureMapper.readTree(browser.get("/api/v1/me", session).body())
                assertEquals(userId, me["user"]["userId"].asString())
                val snapshot = browser.get("/api/v1/planner", session, mapOf(PlannerController.ACCOUNT_HEADER to userId))
                assertEquals(200, snapshot.statusCode(), snapshot.body())
                val savedRecords = fixtureMapper.readTree(snapshot.body())["records"].sortedBy { it["id"].asString() }
                assertEquals(expected["records"].sortedBy { it["id"].asString() }, savedRecords)
                val retried = browser.post("/api/v1/planner/commit", session, headers(browser, session, userId), request.toString())
                assertEquals(200, retried.statusCode(), retried.body())
                assertEquals(expected, fixtureMapper.readTree(retried.body()))

                val chunked = browser.postChunked("/api/v1/planner/commit", session, headers(browser, session, userId),
                    ByteArray(PlannerLimits.BODY_BYTES + 1) { ' '.code.toByte() })
                assertEquals(413, chunked.statusCode(), chunked.body())
                assertEquals("payload_too_large", fixtureMapper.readTree(chunked.body())["error"].asString())

                // Real datasource closure simulates unavailable DB connections without any mock fallback.
                context.getBean(HikariDataSource::class.java).close()
                val meOutage = browser.get("/api/v1/me", session)
                assertEquals(503, meOutage.statusCode(), meOutage.body())
                assertEquals("storage_unavailable", fixtureMapper.readTree(meOutage.body())["error"].asString())
                val readOutage = browser.get("/api/v1/planner", session, mapOf(PlannerController.ACCOUNT_HEADER to userId))
                assertEquals(503, readOutage.statusCode())
                val writeOutage = browser.post("/api/v1/planner/commit", session, headers(browser, session, userId), request.toString())
                assertEquals(503, writeOutage.statusCode())
            }
        }
    }

    private fun start(provider: MockOidcProvider): ConfigurableApplicationContext =
        SpringApplicationBuilder(PlannetApiApplication::class.java).run(
            "--server.port=0", "--spring.main.banner-mode=off", "--plannet.storage.enabled=true",
            "--plannet.storage.url=${System.getenv("PLANNET_TEST_DB_URL")}",
            "--plannet.storage.username=${System.getenv("PLANNET_TEST_DB_USERNAME")}",
            "--plannet.storage.password=${System.getenv("PLANNET_TEST_DB_PASSWORD")}",
            "--plannet.auth.google.client-id=$clientId", "--plannet.auth.google.client-secret=restart-secret",
            "--plannet.auth.google.provider.issuer-uri=${provider.baseUrl}",
            "--plannet.auth.google.provider.authorization-uri=${provider.baseUrl}/authorize",
            "--plannet.auth.google.provider.token-uri=${provider.baseUrl}/token",
            "--plannet.auth.google.provider.jwk-set-uri=${provider.baseUrl}/jwks",
            "--plannet.auth.google.provider.user-info-uri=${provider.baseUrl}/userinfo",
        )

    private fun browser(context: ConfigurableApplicationContext) =
        HttpTestClient("http://localhost:${context.environment.getProperty("local.server.port")}")

    private fun login(browser: HttpTestClient, provider: MockOidcProvider, subject: String): String {
        val start = browser.get("/oauth2/authorization/google")
        val params = queryParams(start.location())
        val code = provider.issueCode(params.getValue("nonce"), MockOidcProvider.Profile(subject, "Stored user", "same@example.test", null))
        val callback = browser.get("/login/oauth2/code/google?code=$code&state=${params.getValue("state")}", assertNotNull(start.sessionId()))
        assertEquals("/", callback.location())
        return assertNotNull(callback.sessionId())
    }

    private fun headers(browser: HttpTestClient, session: String, userId: String): Map<String, String> {
        val token = fixtureMapper.readTree(browser.get("/api/v1/csrf", session).body())
        return mapOf("Content-Type" to "application/json", PlannerController.ACCOUNT_HEADER to userId,
            token["headerName"].asString() to token["token"].asString())
    }
}

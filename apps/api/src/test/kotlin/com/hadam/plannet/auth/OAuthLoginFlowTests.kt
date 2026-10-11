package com.hadam.plannet.auth

import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * 실제 HTTP로 로그인 시작 → callback → me → CSRF logout 흐름을 검증한다.
 * Google 대신 [MockOidcProvider]를 쓰므로 실제 Google 계정 검증과는 구분된다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OAuthLoginFlowTests @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val jsonMapper: JsonMapper,
) {
    private lateinit var browser: HttpTestClient
    private val profile = MockOidcProvider.Profile(
        subject = "google-sub-flow",
        name = "Flow User",
        email = "flow@example.com",
        picture = "https://example.com/flow.png",
    )

    @BeforeEach
    fun setUp() {
        browser = HttpTestClient("http://localhost:$port")
        provider.tokenEndpointFails = false
    }

    /** 로그인 시작 → (Google 동의 대신 code 발급) → callback. 로그인 전·후 세션 id를 돌려준다. */
    private fun login(): Pair<String, String> {
        val start = browser.get("/oauth2/authorization/google")
        assertEquals(302, start.statusCode())
        val preLoginSession = assertNotNull(start.sessionId())
        val params = queryParams(start.location())
        assertEquals("http://localhost:$port/login/oauth2/code/google", params["redirect_uri"])

        val code = provider.issueCode(nonce = params.getValue("nonce"), profile = profile)
        val callback = browser.get(
            "/login/oauth2/code/google?code=$code&state=${params.getValue("state")}",
            session = preLoginSession,
        )
        assertEquals(302, callback.statusCode())
        assertEquals("/", callback.location())
        return preLoginSession to assertNotNull(callback.sessionId(), "session id must rotate on login")
    }

    @Test
    fun `session cookie is host-wide http-only lax cookie without secure flag locally`() {
        val cookie = assertNotNull(browser.get("/oauth2/authorization/google").sessionSetCookie())
        assertContains(cookie, "Path=/;")
        assertContains(cookie, "HttpOnly")
        assertContains(cookie, "SameSite=Lax")
        assertFalse(cookie.contains("Secure"))
    }

    @Test
    fun `full login then web server forwarded cookie then logout`() {
        val (preLoginSession, session) = login()
        assertNotEquals(preLoginSession, session)
        assertEquals(401, browser.get("/api/v1/me", session = preLoginSession).statusCode())

        // Web 서버가 브라우저 쿠키만 전달해 내부 주소로 검증하는 경우(별도 클라이언트, 127.0.0.1 host).
        val webServer = HttpTestClient("http://127.0.0.1:$port")
        val me = webServer.get("/api/v1/me", session = session)
        assertEquals(200, me.statusCode())
        val body = jsonMapper.readTree(me.body())
        assertTrue(body["authenticated"].asBoolean())
        assertEquals("google", body["user"]["authProvider"].asString())
        assertEquals("google-sub-flow", body["user"]["externalSubject"].asString())
        assertEquals("Flow User", body["user"]["name"].asString())
        assertEquals("flow@example.com", body["user"]["email"].asString())
        assertEquals("https://example.com/flow.png", body["user"]["image"].asString())

        val csrf = jsonMapper.readTree(browser.get("/api/v1/csrf", session = session).body())
        val csrfHeader = mapOf(csrf["headerName"].asString() to csrf["token"].asString())
        assertEquals(403, browser.post("/api/v1/logout", session = session).statusCode())
        assertEquals(200, browser.get("/api/v1/me", session = session).statusCode())

        val logout = browser.post("/api/v1/logout", session = session, headers = csrfHeader)
        assertEquals(204, logout.statusCode())
        assertContains(assertNotNull(logout.sessionSetCookie()), "Expires=Thu, 01 Jan 1970")

        val afterLogout = webServer.get("/api/v1/me", session = session)
        assertEquals(401, afterLogout.statusCode())
        assertEquals("""{"authenticated":false}""", afterLogout.body())
        assertEquals(401, browser.get("/api/v1/plans", session = session).statusCode())
    }

    @Test
    fun `provider token endpoint outage redirects to web error and keeps user logged out`() {
        provider.tokenEndpointFails = true
        val start = browser.get("/oauth2/authorization/google")
        val session = assertNotNull(start.sessionId())
        val params = queryParams(start.location())
        val code = provider.issueCode(nonce = params.getValue("nonce"), profile = profile)

        val callback = browser.get("/login/oauth2/code/google?code=$code&state=${params["state"]}", session = session)
        assertEquals(302, callback.statusCode())
        assertEquals("/?authError=login_failed", callback.location())
        assertEquals(401, browser.get("/api/v1/me", session = session).statusCode())
    }

    @Test
    fun `replayed state after login is rejected`() {
        val start = browser.get("/oauth2/authorization/google")
        val session = assertNotNull(start.sessionId())
        val params = queryParams(start.location())
        val code = provider.issueCode(nonce = params.getValue("nonce"), profile = profile)
        val path = "/login/oauth2/code/google?code=$code&state=${params["state"]}"
        val loggedIn = assertNotNull(browser.get(path, session = session).sessionId())

        val replay = browser.get(path, session = loggedIn)
        assertEquals("/?authError=login_failed", replay.location())
    }

    @Test
    fun `forwarded host header is ignored in local profile`() {
        val start = browser.get(
            "/oauth2/authorization/google",
            headers = mapOf("X-Forwarded-Host" to "evil.example", "X-Forwarded-Proto" to "https"),
        )
        assertEquals(
            "http://localhost:$port/login/oauth2/code/google",
            queryParams(start.location())["redirect_uri"],
        )
    }

    companion object {
        private const val CLIENT_ID = "flow-client-id"
        private val provider = MockOidcProvider(CLIENT_ID)

        @JvmStatic
        @DynamicPropertySource
        fun oidcProperties(registry: DynamicPropertyRegistry) {
            registry.add("plannet.auth.google.client-id") { CLIENT_ID }
            registry.add("plannet.auth.google.client-secret") { "flow-client-secret" }
            registry.add("plannet.auth.google.provider.issuer-uri") { provider.baseUrl }
            registry.add("plannet.auth.google.provider.authorization-uri") { "${provider.baseUrl}/authorize" }
            registry.add("plannet.auth.google.provider.token-uri") { "${provider.baseUrl}/token" }
            registry.add("plannet.auth.google.provider.jwk-set-uri") { "${provider.baseUrl}/jwks" }
            registry.add("plannet.auth.google.provider.user-info-uri") { "${provider.baseUrl}/userinfo" }
        }

        @JvmStatic
        @AfterAll
        fun stopProvider() = provider.close()
    }
}

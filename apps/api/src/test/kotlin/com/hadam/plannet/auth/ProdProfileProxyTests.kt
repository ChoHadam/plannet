package com.hadam.plannet.auth

import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.test.context.ActiveProfiles
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

private const val FORWARDED_ORIGIN = "https://plannet.example.com"
private val forwardedHeaders = mapOf(
    "X-Forwarded-Proto" to "https",
    "X-Forwarded-Host" to "plannet.example.com",
    "X-Forwarded-For" to "203.0.113.10",
)

/**
 * prod 프로필: Secure 쿠키, 신뢰 프록시의 X-Forwarded-* 만 반영.
 * redirect-uri를 {baseUrl}로 두어 프록시 헤더 반영 여부를 관찰한다(실배포는 GOOGLE_REDIRECT_URI 고정 권장).
 */
class ProdProfileProxyTests {
    @Nested
    @ActiveProfiles("prod")
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "plannet.storage.enabled=false",
            "plannet.auth.google.client-id=prod-client",
            "plannet.auth.google.client-secret=prod-secret",
            "plannet.auth.google.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}",
            "PLANNET_TRUSTED_PROXIES=127\\.0\\.0\\.1|0:0:0:0:0:0:0:1",
        ],
    )
    inner class TrustedProxy @Autowired constructor(@param:LocalServerPort private val port: Int) {
        @Test
        fun `forwarded https origin from trusted proxy is used and cookie is secure`() {
            val start = HttpTestClient("http://127.0.0.1:$port")
                .get("/oauth2/authorization/google", headers = forwardedHeaders)
            assertEquals(
                "$FORWARDED_ORIGIN/login/oauth2/code/google",
                queryParams(start.location())["redirect_uri"],
            )
            val cookie = assertNotNull(start.sessionSetCookie())
            assertContains(cookie, "Secure")
            assertContains(cookie, "Path=/;")
            assertContains(cookie, "SameSite=Lax")
        }
    }

    @Nested
    @ActiveProfiles("prod")
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "plannet.storage.enabled=false",
            "plannet.auth.google.client-id=prod-client",
            "plannet.auth.google.client-secret=prod-secret",
            "plannet.auth.google.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}",
            "PLANNET_TRUSTED_PROXIES=10\\.99\\.99\\.99",
        ],
    )
    inner class UntrustedProxy @Autowired constructor(@param:LocalServerPort private val port: Int) {
        @Test
        fun `forwarded headers from untrusted peer are ignored`() {
            val start = HttpTestClient("http://127.0.0.1:$port")
                .get("/oauth2/authorization/google", headers = forwardedHeaders)
            assertEquals(
                "http://127.0.0.1:$port/login/oauth2/code/google",
                queryParams(start.location())["redirect_uri"],
            )
        }
    }
}

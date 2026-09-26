package com.hadam.plannet.auth

import com.hadam.plannet.auth.config.AuthProperties
import com.hadam.plannet.auth.config.GoogleClientRegistrationConfig
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

/** Google client 설정이 없을 때: 로그인만 불가, 보호 경로는 계속 닫혀 있어야 한다. */
@SpringBootTest(properties = ["plannet.auth.login-failure-url=http://web.local/login"])
@AutoConfigureMockMvc
class AuthUnavailableTests @Autowired constructor(
    private val mockMvc: MockMvc,
) {
    @Test
    fun `login start and callback redirect to web with auth_unavailable`() {
        mockMvc.get("/oauth2/authorization/google").andExpect {
            status { is3xxRedirection() }
            redirectedUrl("http://web.local/login?authError=auth_unavailable")
        }
        mockMvc.get("/login/oauth2/code/google") { param("code", "c"); param("state", "s") }.andExpect {
            redirectedUrl("http://web.local/login?authError=auth_unavailable")
        }
    }

    @Test
    fun `protected endpoints stay closed`() {
        mockMvc.get("/api/v1/me").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/v1/plans").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/v1/health").andExpect { status { isOk() } }
    }

    @Test
    fun `startup fails when redirect uri is blank or unresolved`() {
        listOf("", "\${GOOGLE_REDIRECT_URI}").forEach { redirectUri ->
            val properties = AuthProperties(
                google = AuthProperties.Google(clientId = "id", clientSecret = "secret", redirectUri = redirectUri),
            )
            assertThrows<IllegalStateException> {
                GoogleClientRegistrationConfig().clientRegistrationRepository(properties)
            }
        }
    }

    @Test
    fun `startup fails when google client is required but missing`() {
        val properties = AuthProperties(requireGoogleClient = true)
        assertThrows<IllegalStateException> {
            GoogleClientRegistrationConfig().clientRegistrationRepository(properties)
        }
    }
}

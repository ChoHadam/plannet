package com.hadam.plannet.auth

import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(
    properties = [
        "plannet.auth.google.client-id=test-client-id",
        "plannet.auth.google.client-secret=test-client-secret",
    ],
)
@AutoConfigureMockMvc
class AuthSecurityPolicyTests @Autowired constructor(
    private val mockMvc: MockMvc,
    private val clientRegistrationRepository: ClientRegistrationRepository,
    private val jsonMapper: JsonMapper,
) {
    private val browserAccept = "text/html,application/xhtml+xml,*/*;q=0.8"

    private fun googleLogin(emailVerified: Boolean = true) = oidcLogin()
        .clientRegistration(clientRegistrationRepository.findByRegistrationId("google"))
        .idToken {
            it.subject("google-sub-123")
                .claim("name", "Test User")
                .claim("email", "test@example.com")
                .claim("email_verified", emailVerified)
                .claim("picture", "https://example.com/p.png")
        }

    @Test
    fun `me returns 401 json for anonymous request even when browser asks for html`() {
        mockMvc.get("/api/v1/me") { header("Accept", browserAccept) }
            .andExpect {
                status { isUnauthorized() }
                header { doesNotExist("Location") }
                content { json("""{"authenticated":false}""", strict = true) }
            }
    }

    @Test
    fun `me returns google profile for authenticated session`() {
        mockMvc.get("/api/v1/me") { with(googleLogin()) }
            .andExpect {
                status { isOk() }
                header { string("Cache-Control", containsString("no-store")) }
                content {
                    json(
                        """
                        {"authenticated":true,"storageEnabled":false,"user":{
                          "authProvider":"google","externalSubject":"google-sub-123",
                          "name":"Test User","email":"test@example.com","image":"https://example.com/p.png"}}
                        """,
                        strict = true,
                    )
                }
            }
    }

    @Test
    fun `me hides unverified email`() {
        mockMvc.get("/api/v1/me") { with(googleLogin(emailVerified = false)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.user.email", nullValue())
            }
    }

    @Test
    fun `health is public`() {
        mockMvc.get("/api/v1/health").andExpect { status { isOk() } }
    }

    @Test
    fun `planner endpoints report explicitly disabled storage in authentication only mode`() {
        mockMvc.get("/api/v1/planner") { with(googleLogin()) }.andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.error", equalTo("storage_disabled"))
        }
        mockMvc.post("/api/v1/planner/commit") {
            with(googleLogin()); with(csrf())
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.error", equalTo("storage_disabled"))
        }
    }

    @Test
    fun `other api paths require authentication with json 401`() {
        mockMvc.get("/api/v1/plans") { header("Accept", browserAccept) }
            .andExpect {
                status { isUnauthorized() }
                header { doesNotExist("Location") }
                content { json("""{"authenticated":false}""", strict = true) }
            }
        mockMvc.get("/api/v1/plans") { with(googleLogin()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `paths outside api are denied and no default login page is served`() {
        mockMvc.get("/login").andExpect {
            status { isUnauthorized() }
            header { doesNotExist("Location") }
        }
        mockMvc.get("/") { with(googleLogin()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `csrf endpoint returns header name and token`() {
        mockMvc.get("/api/v1/csrf")
            .andExpect {
                status { isOk() }
                jsonPath("$.headerName", equalTo("X-CSRF-TOKEN"))
                jsonPath("$.token", not(equalTo("")))
            }
    }

    @Test
    fun `logout without csrf token is rejected`() {
        mockMvc.post("/api/v1/logout") { with(googleLogin()) }
            .andExpect {
                status { isForbidden() }
                content { json("""{"error":"csrf_invalid"}""", strict = true) }
            }
        mockMvc.post("/api/v1/logout") {
            with(googleLogin())
            header("X-CSRF-TOKEN", "forged")
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `logout with token from csrf endpoint ends session and returns 204`() {
        val session = MockHttpSession()
        mockMvc.get("/api/v1/me") {
            this.session = session
            with(googleLogin())
        }.andExpect { status { isOk() } }

        val csrfBody = mockMvc.get("/api/v1/csrf") { this.session = session }
            .andReturn().response.contentAsString
        val csrfToken = jsonMapper.readTree(csrfBody)

        mockMvc.post("/api/v1/logout") {
            this.session = session
            header(csrfToken["headerName"].asString(), csrfToken["token"].asString())
        }.andExpect {
            status { isNoContent() }
            header { doesNotExist("Location") }
            cookie {
                exists("PLANNET_SESSION")
                maxAge("PLANNET_SESSION", 0)
                path("PLANNET_SESSION", "/")
            }
        }
        check(session.isInvalid) { "session must be invalidated on logout" }
    }

    @Test
    fun `logout with valid csrf also succeeds for anonymous session`() {
        mockMvc.post("/api/v1/logout") { with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `login start redirects to google with state nonce and callback`() {
        mockMvc.get("/oauth2/authorization/google")
            .andExpect {
                status { is3xxRedirection() }
                header {
                    string("Location", startsWith("https://accounts.google.com/o/oauth2/v2/auth?"))
                    string("Location", containsString("client_id=test-client-id"))
                    string("Location", containsString("redirect_uri=http://localhost/login/oauth2/code/google"))
                    string("Location", containsString("scope=openid%20profile%20email"))
                    string("Location", containsString("state="))
                    string("Location", containsString("nonce="))
                }
            }
    }

    @Test
    fun `callback without matching authorization request redirects to web with error`() {
        mockMvc.get("/login/oauth2/code/google") {
            param("code", "code")
            param("state", "unknown-state")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/?authError=login_failed")
        }
    }
}

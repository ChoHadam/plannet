package com.hadam.plannet.auth

import com.hadam.plannet.auth.config.AuthPaths
import com.hadam.plannet.auth.domain.EMAIL_MAX_LENGTH
import com.hadam.plannet.auth.domain.toAuthenticatedUser
import com.hadam.plannet.auth.domain.verifiedProfileEmail
import org.junit.jupiter.api.Test
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Only a validated OIDC ID token with `email_verified == true` and a well-formed address may be stored. */
class AuthenticatedUserEmailTests {
    private val authorities = listOf(SimpleGrantedAuthority("OIDC_USER"))

    private fun oidc(claims: Map<String, Any>): OAuth2AuthenticationToken {
        val idToken = OidcIdToken("token", Instant.now(), Instant.now().plusSeconds(60), mapOf("sub" to "subject-1") + claims)
        return OAuth2AuthenticationToken(DefaultOidcUser(authorities, idToken), authorities, AuthPaths.REGISTRATION_ID)
    }

    private fun verified(email: Any) = oidc(mapOf("email" to email, "email_verified" to true))

    @Test
    fun `verified Boolean true claim yields the exact address up to 320 characters`() {
        assertEquals("person@example.test", verified("person@example.test").verifiedProfileEmail())
        val longest = "a".repeat(64) + "@" + "b".repeat(EMAIL_MAX_LENGTH - 65)
        assertEquals(longest, verified(longest).verifiedProfileEmail())
        assertNull(verified(longest + "c").verifiedProfileEmail())
    }

    @Test
    fun `missing false or non Boolean verification claims are never storable`() {
        assertNull(oidc(mapOf("email" to "person@example.test")).verifiedProfileEmail())
        assertNull(oidc(mapOf("email" to "person@example.test", "email_verified" to false)).verifiedProfileEmail())
        assertNull(oidc(mapOf("email" to "person@example.test", "email_verified" to "true")).verifiedProfileEmail())
        assertNull(oidc(mapOf("email_verified" to true)).verifiedProfileEmail())
        // The display response keeps its previous rule (hidden only when explicitly unverified).
        assertEquals("person@example.test", oidc(mapOf("email" to "person@example.test")).toAuthenticatedUser()!!.email)
    }

    @Test
    fun `malformed whitespace control or non string addresses are rejected without failing identity`() {
        listOf(
            "", "no-at-sign", "@example.test", "person@", "a@b@example.test", " person@example.test",
            "person@example.test ", "per son@example.test", "person@exa\tmple.test", "person@example.test\n",
            "person\u0000@example.test", "person @example.test", "person @example.test", "person\u007f@example.test",
        ).forEach { assertNull(verified(it).verifiedProfileEmail(), it) }
        assertNull(verified(listOf("person@example.test")).verifiedProfileEmail())
        assertEquals("subject-1", verified("bad address").toAuthenticatedUser()!!.externalSubject)
    }

    @Test
    fun `a plain OAuth2 principal without a validated ID token is not trusted for storage`() {
        val attributes = mapOf("sub" to "subject-1", "email" to "person@example.test", "email_verified" to true)
        val token = OAuth2AuthenticationToken(DefaultOAuth2User(authorities, attributes, "sub"), authorities, AuthPaths.REGISTRATION_ID)
        assertNull(token.verifiedProfileEmail())
    }
}

package com.hadam.plannet.auth.domain

import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.core.oidc.user.OidcUser

/**
 * 현재 요청의 외부 provider 인증 정보.
 * [externalSubject]는 provider가 발급한 식별자(Google `sub`)이며 내부 userId가 아니다.
 * 서버 저장 활성화 시에만 내부 userId를 반환한다.
 */
data class AuthenticatedUser(
    val authProvider: String,
    val externalSubject: String,
    val name: String?,
    val email: String?,
    val image: String?,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val userId: String? = null,
)

fun OAuth2AuthenticationToken.toAuthenticatedUser(): AuthenticatedUser? {
    val attributes = principal?.attributes ?: return null
    val subject = attributes[StandardClaimNames.SUB]?.toString()?.takeIf { it.isNotBlank() } ?: return null
    val emailVerified = attributes[StandardClaimNames.EMAIL_VERIFIED] != false
    return AuthenticatedUser(
        authProvider = authorizedClientRegistrationId,
        externalSubject = subject,
        name = attributes[StandardClaimNames.NAME]?.toString(),
        email = attributes[StandardClaimNames.EMAIL]?.toString()?.takeIf { emailVerified },
        image = attributes[StandardClaimNames.PICTURE]?.toString(),
    )
}

/** RFC 5321 path limit; matches `plannet_user.email VARCHAR(320)`. */
const val EMAIL_MAX_LENGTH = 320

/**
 * Email that may be stored as account profile metadata: only from a validated OIDC ID token whose `email_verified`
 * claim is exactly `true`. Missing/unverified/malformed claims return null (keep the known value), never fail login.
 */
fun OAuth2AuthenticationToken.verifiedProfileEmail(): String? {
    val user = principal as? OidcUser ?: return null
    if (user.attributes[StandardClaimNames.EMAIL_VERIFIED] != true) return null
    return (user.attributes[StandardClaimNames.EMAIL] as? String)?.takeIf { isStorableEmail(it) }
}

internal fun isStorableEmail(email: String): Boolean {
    if (email.length > EMAIL_MAX_LENGTH) return false
    if (email.any { it.isWhitespace() || it.isISOControl() || Character.isSpaceChar(it) }) return false
    val at = email.indexOf('@')
    return at > 0 && at == email.lastIndexOf('@') && at < email.lastIndex
}

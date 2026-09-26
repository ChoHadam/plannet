package com.hadam.plannet.auth.domain

import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.core.oidc.StandardClaimNames

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

package com.hadam.plannet.auth.config

import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository

/**
 * Google client 등록.
 * client id/secret이 없으면 로그인 경로만 "인증 불가"로 응답하고 나머지 API는 계속 동작한다.
 * 이 경우에도 보호 경로는 열리지 않는다(인증된 세션을 만들 방법이 없다).
 */
@Configuration(proxyBeanMethods = false)
class GoogleClientRegistrationConfig {
    private val log = LoggerFactory.getLogger(javaClass)

    @Bean
    fun clientRegistrationRepository(properties: AuthProperties): ClientRegistrationRepository {
        val google = properties.google
        if (!google.isConfigured) {
            check(!properties.requireGoogleClient) {
                "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET must be set when plannet.auth.require-google-client=true"
            }
            log.warn("Google OAuth client is not configured; login endpoints will report auth_unavailable")
            return ClientRegistrationRepository { null }
        }
        check(google.redirectUri.isNotBlank() && !google.redirectUri.contains("\${")) {
            "GOOGLE_REDIRECT_URI must be set to the public callback URL"
        }
        return InMemoryClientRegistrationRepository(googleRegistration(google))
    }

    private fun googleRegistration(google: AuthProperties.Google): ClientRegistration {
        val provider = google.provider
        return CommonOAuth2Provider.GOOGLE.getBuilder(AuthPaths.REGISTRATION_ID)
            .clientId(google.clientId)
            .clientSecret(google.clientSecret)
            .redirectUri(google.redirectUri)
            .apply {
                provider.issuerUri?.let { issuerUri(it) }
                provider.authorizationUri?.let { authorizationUri(it) }
                provider.tokenUri?.let { tokenUri(it) }
                provider.jwkSetUri?.let { jwkSetUri(it) }
                provider.userInfoUri?.let { userInfoUri(it) }
            }
            .build()
    }
}

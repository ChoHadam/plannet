package com.hadam.plannet.auth.config

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * 인증 관련 설정. 비밀값(client secret)은 환경변수로만 주입한다.
 * 기본값과 환경변수 매핑은 application.yml을 참고한다.
 */
@ConfigurationProperties(prefix = "plannet.auth")
data class AuthProperties(
    /** 로그인 성공 후 브라우저를 보낼 Web 주소. 같은 origin이면 상대 경로를 쓴다. */
    val loginSuccessUrl: String = "/",
    /** 로그인 실패·인증 불가 시 브라우저를 보낼 Web 주소. `authError` 쿼리가 붙는다. */
    val loginFailureUrl: String = "/",
    /** true면 Google client 설정이 없을 때 기동을 실패시킨다(배포 환경). */
    val requireGoogleClient: Boolean = false,
    val google: Google = Google(),
) {
    data class Google(
        val clientId: String = "",
        val clientSecret: String = "",
        val redirectUri: String = "{baseUrl}/login/oauth2/code/{registrationId}",
        /**
         * Provider endpoint 재정의. 로컬 모의 OIDC 서버 검증용이며 운영에서는 비워 둔다.
         * 비어 있으면 Google 기본값(CommonOAuth2Provider.GOOGLE)을 쓴다.
         */
        val provider: Provider = Provider(),
    ) {
        val isConfigured: Boolean
            get() = clientId.isNotBlank() && clientSecret.isNotBlank()
    }

    data class Provider(
        val issuerUri: String? = null,
        val authorizationUri: String? = null,
        val tokenUri: String? = null,
        val jwkSetUri: String? = null,
        val userInfoUri: String? = null,
    )
}

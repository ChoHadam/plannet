package com.hadam.plannet.auth.config

/** Web과 공유하는 인증 경로. 계약: docs/contracts/auth-v1.md */
object AuthPaths {
    const val REGISTRATION_ID = "google"
    const val AUTHORIZATION_BASE = "/oauth2/authorization"
    const val AUTHORIZATION = "$AUTHORIZATION_BASE/$REGISTRATION_ID"
    const val CALLBACK_BASE = "/login/oauth2/code"
    const val ME = "/api/v1/me"
    const val CSRF = "/api/v1/csrf"
    const val LOGOUT = "/api/v1/logout"
    const val HEALTH = "/api/v1/health"
    const val API = "/api/v1/**"
    const val ERROR = "/error"

    /** 로그인 실패 시 Web으로 돌려보낼 때 붙이는 쿼리 이름과 값 */
    const val AUTH_ERROR_PARAM = "authError"
    const val AUTH_ERROR_LOGIN_FAILED = "login_failed"
    const val AUTH_ERROR_UNAVAILABLE = "auth_unavailable"
}

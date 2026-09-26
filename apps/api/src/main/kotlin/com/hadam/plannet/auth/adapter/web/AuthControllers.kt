package com.hadam.plannet.auth.adapter.web

import com.hadam.plannet.auth.config.AuthPaths
import com.hadam.plannet.auth.domain.AuthenticatedUser
import com.hadam.plannet.auth.domain.toAuthenticatedUser
import com.hadam.plannet.storage.PlannerStorage
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class MeController(private val storageProvider: ObjectProvider<PlannerStorage>) {
    /** 인증 여부를 401/200으로 구분해 응답한다. Web 서버가 전달한 세션 쿠키로도 호출된다. */
    @GetMapping(AuthPaths.ME)
    fun me(authentication: Authentication?): ResponseEntity<Any> {
        val user = (authentication as? OAuth2AuthenticationToken)?.toAuthenticatedUser()
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(UnauthenticatedResponse())
        val storage = storageProvider.ifAvailable
        val userId = storage?.resolveUser(user.authProvider, user.externalSubject)
        return ResponseEntity.ok(AuthenticatedResponse(user = user.copy(userId = userId?.toString()), storageEnabled = storage != null))
    }
}

@RestController
class CsrfController {
    /** 변경 요청(logout 등)에 보낼 CSRF 헤더 이름과 토큰. 토큰은 세션에 묶인다. */
    @GetMapping(AuthPaths.CSRF)
    fun csrf(token: CsrfToken): CsrfResponse = CsrfResponse(headerName = token.headerName, token = token.token)
}

data class AuthenticatedResponse(
    val authenticated: Boolean = true,
    val user: AuthenticatedUser,
    val storageEnabled: Boolean = false,
)

data class UnauthenticatedResponse(
    val authenticated: Boolean = false,
)

data class CsrfResponse(
    val headerName: String,
    val token: String,
)

data class ErrorResponse(
    val error: String,
) {
    companion object {
        const val FORBIDDEN = "forbidden"
        const val CSRF_INVALID = "csrf_invalid"
    }
}

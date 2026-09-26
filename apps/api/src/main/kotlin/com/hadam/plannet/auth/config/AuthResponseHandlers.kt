package com.hadam.plannet.auth.config

import com.hadam.plannet.auth.adapter.web.ErrorResponse
import com.hadam.plannet.auth.adapter.web.UnauthenticatedResponse
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.DefaultRedirectStrategy
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.csrf.CsrfException
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.util.UriComponentsBuilder
import tools.jackson.databind.json.JsonMapper

/** API 미인증 응답. 로그인 HTML로 redirect하지 않고 401 JSON을 준다. */
class JsonUnauthorizedEntryPoint(
    private val jsonMapper: JsonMapper,
) : AuthenticationEntryPoint {
    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: AuthenticationException,
    ) = writeJson(response, HttpStatus.UNAUTHORIZED, jsonMapper.writeValueAsString(UnauthenticatedResponse()))
}

/** 권한 부족·CSRF 실패 응답. CSRF 실패는 Web이 토큰을 다시 받도록 별도 코드로 구분한다. */
class JsonAccessDeniedHandler(
    private val jsonMapper: JsonMapper,
) : AccessDeniedHandler {
    override fun handle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        accessDeniedException: AccessDeniedException,
    ) {
        val error = if (accessDeniedException is CsrfException) ErrorResponse.CSRF_INVALID else ErrorResponse.FORBIDDEN
        writeJson(response, HttpStatus.FORBIDDEN, jsonMapper.writeValueAsString(ErrorResponse(error)))
    }
}

/** 로그인 실패(사용자 거부, state 불일치, Google token/JWK 장애 등) 시 Web으로 돌려보낸다. */
class LoginFailureRedirectHandler(
    private val loginFailureUrl: String,
) : AuthenticationFailureHandler {
    private val log = LoggerFactory.getLogger(javaClass)
    private val redirectStrategy = DefaultRedirectStrategy()

    override fun onAuthenticationFailure(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: AuthenticationException,
    ) {
        // 예외 메시지에는 token 응답 일부가 섞일 수 있으므로 타입과 표준 오류 코드만 남긴다.
        val errorCode = (exception as? OAuth2AuthenticationException)?.error?.errorCode
        log.warn("OAuth2 login failed: {} (error={})", exception.javaClass.simpleName, errorCode)
        redirectStrategy.sendRedirect(
            request,
            response,
            authErrorUrl(loginFailureUrl, AuthPaths.AUTH_ERROR_LOGIN_FAILED),
        )
    }
}

/** Google client 설정이 없을 때 로그인 시작·callback 요청을 Web의 실패 화면으로 돌려보낸다. */
class AuthUnavailableFilter(
    private val loginFailureUrl: String,
) : OncePerRequestFilter() {
    private val redirectStrategy = DefaultRedirectStrategy()

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val path = request.requestURI.removePrefix(request.contextPath)
        return !(path.startsWith("${AuthPaths.AUTHORIZATION_BASE}/") || path.startsWith("${AuthPaths.CALLBACK_BASE}/"))
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) = redirectStrategy.sendRedirect(
        request,
        response,
        authErrorUrl(loginFailureUrl, AuthPaths.AUTH_ERROR_UNAVAILABLE),
    )
}

private fun authErrorUrl(baseUrl: String, error: String): String =
    UriComponentsBuilder.fromUriString(baseUrl)
        .replaceQueryParam(AuthPaths.AUTH_ERROR_PARAM, error)
        .build()
        .toUriString()

private fun writeJson(response: HttpServletResponse, status: HttpStatus, body: String) {
    response.status = status.value()
    response.contentType = MediaType.APPLICATION_JSON_VALUE
    response.characterEncoding = Charsets.UTF_8.name()
    response.writer.write(body)
}

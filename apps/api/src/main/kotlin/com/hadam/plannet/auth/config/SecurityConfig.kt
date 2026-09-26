package com.hadam.plannet.auth.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler
import org.springframework.security.web.savedrequest.NullRequestCache
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthProperties::class)
class SecurityConfig {
    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        properties: AuthProperties,
        clientRegistrationRepository: ClientRegistrationRepository,
        jsonMapper: JsonMapper,
        @Value("\${server.servlet.session.cookie.name}") sessionCookieName: String,
    ): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize(HttpMethod.GET, AuthPaths.HEALTH, permitAll)
                authorize(HttpMethod.GET, AuthPaths.ME, permitAll)
                authorize(HttpMethod.GET, AuthPaths.CSRF, permitAll)
                authorize(AuthPaths.ERROR, permitAll)
                authorize(AuthPaths.API, authenticated)
                authorize(anyRequest, denyAll)
            }
            oauth2Login {
                // 사용자 지정 loginPage를 두어 Spring 기본 로그인 HTML 페이지 생성을 끈다.
                loginPage = AuthPaths.AUTHORIZATION
                // Google access token은 세션에만 두어 로그아웃·만료 시 함께 사라지게 한다.
                authorizedClientRepository = HttpSessionOAuth2AuthorizedClientRepository()
                authenticationSuccessHandler = SimpleUrlAuthenticationSuccessHandler(properties.loginSuccessUrl)
                    .apply { setAlwaysUseDefaultTargetUrl(true) }
                authenticationFailureHandler = LoginFailureRedirectHandler(properties.loginFailureUrl)
            }
            logout {
                logoutRequestMatcher = PathPatternRequestMatcher.withDefaults()
                    .matcher(HttpMethod.POST, AuthPaths.LOGOUT)
                logoutSuccessHandler = HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)
                invalidateHttpSession = true
                clearAuthentication = true
                deleteCookies(sessionCookieName)
            }
            exceptionHandling {
                authenticationEntryPoint = JsonUnauthorizedEntryPoint(jsonMapper)
                accessDeniedHandler = JsonAccessDeniedHandler(jsonMapper)
            }
            // 인증 실패한 API 요청을 저장했다가 로그인 후 되돌려 보내지 않는다.
            requestCache { requestCache = NullRequestCache() }
            formLogin { disable() }
            httpBasic { disable() }
            if (!properties.google.isConfigured) {
                addFilterBefore<OAuth2AuthorizationRequestRedirectFilter>(
                    AuthUnavailableFilter(properties.loginFailureUrl),
                )
            }
        }
        return http.build()
    }
}

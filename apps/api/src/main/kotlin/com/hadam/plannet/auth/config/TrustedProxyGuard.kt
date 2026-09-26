package com.hadam.plannet.auth.config

import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory
import org.springframework.boot.web.server.WebServerFactoryCustomizer
import org.springframework.core.Ordered
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

/**
 * 프록시 헤더를 신뢰하는 설정(native)에서 신뢰 프록시 목록이 비면 명확한 메시지로 기동을 실패시킨다.
 * 누락 시 Tomcat 기본값(사설망 전체 신뢰)이나 해석되지 않은 placeholder로 동작하지 않게 한다.
 */
@Component
class TrustedProxyGuard(
    private val environment: Environment,
) : WebServerFactoryCustomizer<TomcatServletWebServerFactory>, Ordered {
    override fun customize(factory: TomcatServletWebServerFactory) {
        if (!environment.getProperty(FORWARD_HEADERS_STRATEGY, "").equals("native", ignoreCase = true)) return
        val proxies = runCatching { environment.getProperty(INTERNAL_PROXIES) }.getOrNull()
        check(!proxies.isNullOrBlank()) {
            "PLANNET_TRUSTED_PROXIES must be set (regex of trusted proxy IPs) when $FORWARD_HEADERS_STRATEGY=native"
        }
    }

    override fun getOrder(): Int = Ordered.HIGHEST_PRECEDENCE

    private companion object {
        const val FORWARD_HEADERS_STRATEGY = "server.forward-headers-strategy"
        const val INTERNAL_PROXIES = "server.tomcat.remoteip.internal-proxies"
    }
}

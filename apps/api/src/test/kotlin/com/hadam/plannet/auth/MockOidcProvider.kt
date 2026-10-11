package com.hadam.plannet.auth

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.time.Instant
import java.util.Date
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * 테스트용 최소 OIDC provider(token·userinfo·jwks). Google 대신 callback 이후 흐름을 검증한다.
 * authorization 화면은 없고, 테스트가 authorization redirect의 state/nonce로 직접 code를 발급한다.
 */
class MockOidcProvider(private val clientId: String) : AutoCloseable {
    data class Profile(val subject: String, val name: String?, val email: String?, val picture: String?)

    private data class Grant(val nonce: String, val profile: Profile)

    private val key = RSAKeyGenerator(2048).keyID("test-key").generate()
    private val grants = ConcurrentHashMap<String, Grant>()
    private val accessTokens = ConcurrentHashMap<String, Profile>()
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)

    @Volatile
    var tokenEndpointFails = false

    val baseUrl: String get() = "http://127.0.0.1:${server.address.port}"

    init {
        server.createContext("/jwks") { it.respond(200, JWKSet(key.toPublicJWK()).toString()) }
        server.createContext("/token") { handleToken(it) }
        server.createContext("/userinfo") { handleUserInfo(it) }
        server.start()
    }

    fun issueCode(nonce: String, profile: Profile): String =
        UUID.randomUUID().toString().also { grants[it] = Grant(nonce, profile) }

    private fun handleToken(exchange: HttpExchange) {
        if (tokenEndpointFails) return exchange.respond(500, """{"error":"server_error"}""")
        val form = exchange.requestBody.readAllBytes().decodeToString().split("&")
            .associate { it.substringBefore("=") to URLDecoder.decode(it.substringAfter("="), Charsets.UTF_8) }
        val grant = form["code"]?.let { grants.remove(it) }
            ?: return exchange.respond(400, """{"error":"invalid_grant"}""")
        val accessToken = UUID.randomUUID().toString().also { accessTokens[it] = grant.profile }
        exchange.respond(
            200,
            """{"access_token":"$accessToken","token_type":"Bearer","expires_in":3600,""" +
                """"scope":"openid profile email","id_token":"${idToken(grant)}"}""",
        )
    }

    private fun handleUserInfo(exchange: HttpExchange) {
        val token = exchange.requestHeaders.getFirst("Authorization")?.removePrefix("Bearer ")
        val profile = token?.let { accessTokens[it] } ?: return exchange.respond(401, """{"error":"invalid_token"}""")
        exchange.respond(200, """{"sub":"${profile.subject}","email_verified":true}""")
    }

    private fun idToken(grant: Grant): String {
        val now = Instant.now()
        val claims = JWTClaimsSet.Builder()
            .issuer(baseUrl)
            .subject(grant.profile.subject)
            .audience(clientId)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plusSeconds(300)))
            .claim("nonce", grant.nonce)
            .claim("name", grant.profile.name)
            .claim("email", grant.profile.email)
            .claim("email_verified", true)
            .claim("picture", grant.profile.picture)
            .build()
        return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(), claims)
            .apply { sign(RSASSASigner(key)) }
            .serialize()
    }

    private fun HttpExchange.respond(status: Int, body: String) {
        val bytes = body.toByteArray()
        responseHeaders.add("Content-Type", "application/json")
        sendResponseHeaders(status, bytes.size.toLong())
        responseBody.use { it.write(bytes) }
    }

    override fun close() = server.stop(0)
}

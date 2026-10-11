package com.hadam.plannet.auth

import java.net.URI
import java.net.URLDecoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.io.ByteArrayInputStream

const val SESSION_COOKIE = "PLANNET_SESSION"

/** redirect를 따라가지 않고 쿠키를 직접 다루는 HTTP 클라이언트. 브라우저·Web 서버 요청을 흉내 낸다. */
class HttpTestClient(private val baseUrl: String) {
    private val client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()

    fun get(path: String, session: String? = null, headers: Map<String, String> = emptyMap()) =
        send(path, session, headers, HttpRequest.BodyPublishers.noBody(), "GET")

    fun post(path: String, session: String? = null, headers: Map<String, String> = emptyMap(), body: String? = null) =
        send(path, session, headers, body?.let { HttpRequest.BodyPublishers.ofString(it) } ?: HttpRequest.BodyPublishers.noBody(), "POST")

    fun postChunked(path: String, session: String?, headers: Map<String, String>, body: ByteArray) =
        send(path, session, headers, HttpRequest.BodyPublishers.ofInputStream { ByteArrayInputStream(body) }, "POST")

    private fun send(
        path: String,
        session: String?,
        headers: Map<String, String>,
        body: HttpRequest.BodyPublisher,
        method: String,
    ): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI.create(baseUrl + path)).method(method, body)
        session?.let { request.header("Cookie", "$SESSION_COOKIE=$it") }
        headers.forEach { (name, value) -> request.header(name, value) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }
}

fun HttpResponse<*>.sessionSetCookie(): String? =
    headers().allValues("Set-Cookie").firstOrNull { it.startsWith("$SESSION_COOKIE=") }

fun HttpResponse<*>.sessionId(): String? =
    sessionSetCookie()?.substringAfter("=")?.substringBefore(";")

fun HttpResponse<*>.location(): String = headers().firstValue("Location").orElseThrow()

fun queryParams(url: String): Map<String, String> =
    URI.create(url).rawQuery.split("&").associate {
        it.substringBefore("=") to URLDecoder.decode(it.substringAfter("="), Charsets.UTF_8)
    }

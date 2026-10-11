package com.hadam.plannet.storage

import com.hadam.plannet.auth.domain.toAuthenticatedUser
import com.hadam.plannet.auth.domain.verifiedProfileEmail
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.ObjectProvider
import org.springframework.dao.DataAccessException
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.transaction.TransactionException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestController
class PlannerController(
    private val storageProvider: ObjectProvider<PlannerStorage>,
    private val validator: PlannerValidator,
) {
    /**
     * Snapshot with a weak, owner-scoped ETag. Authentication and the account precondition run first, so a 304 is
     * only ever issued to the owner. Headers are written on the servlet response and the body is returned directly
     * (not a ResponseEntity), so Spring's automatic ETag handling cannot add its own 304 (e.g. for `*`).
     */
    @GetMapping("/api/v1/planner")
    fun snapshot(authentication: Authentication?, request: HttpServletRequest, response: HttpServletResponse): PlannerSnapshot? {
        val storage = storage()
        val userId = owner(storage, authentication, request)
        val result = storage.conditionalSnapshot(userId, request.getHeaders(HttpHeaders.IF_NONE_MATCH).toList())
        response.setHeader(HttpHeaders.ETAG, result.etag)
        response.setHeader(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().headerValue)
        if (result.snapshot == null) response.status = HttpServletResponse.SC_NOT_MODIFIED
        return result.snapshot
    }

    @PostMapping("/api/v1/planner/commit", consumes = ["application/json"])
    fun commit(authentication: Authentication?, request: HttpServletRequest): PlannerCommitResponse {
        val storage = storage()
        val userId = owner(storage, authentication, request)
        if (request.contentLengthLong > PlannerLimits.BODY_BYTES) throw PlannerException(413, "payload_too_large")
        // Streaming/chunked requests get the same bound as Content-Length requests, before JSON parsing.
        val body = request.inputStream.readNBytes(PlannerLimits.BODY_BYTES + 1)
        return storage.commit(userId, validator.parse(body))
    }

    private fun storage(): PlannerStorage = storageProvider.ifAvailable ?: throw PlannerException(503, "storage_disabled")

    private fun owner(storage: PlannerStorage, authentication: Authentication?, request: HttpServletRequest): UUID {
        val token = authentication as? OAuth2AuthenticationToken
        val user = token?.toAuthenticatedUser() ?: throw PlannerException(401, "unauthenticated")
        val userId = storage.resolveUser(user.authProvider, user.externalSubject, token.verifiedProfileEmail())
        // This header is an account-switch precondition only. It never selects the owner or any DB row.
        if (request.getHeader(ACCOUNT_HEADER) != userId.toString()) throw PlannerException(409, "account_changed")
        return userId
    }

    companion object { const val ACCOUNT_HEADER = "X-Plannet-User-Id" }
}

@RestControllerAdvice
class PlannerErrorHandler {
    @ExceptionHandler(PlannerException::class)
    fun planner(error: PlannerException): ResponseEntity<PlannerError> = ResponseEntity.status(error.status)
        .cacheControl(CacheControl.noStore()).body(PlannerError(error.code, error.conflicts))

    @ExceptionHandler(DataAccessException::class, TransactionException::class)
    fun unavailable(): ResponseEntity<PlannerError> = ResponseEntity.status(503)
        .cacheControl(CacheControl.noStore()).body(PlannerError("storage_unavailable"))
}

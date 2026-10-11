package com.hadam.plannet.storage

import tools.jackson.databind.JsonNode
import com.fasterxml.jackson.annotation.JsonInclude
import java.util.UUID

object PlannerLimits {
    const val BODY_BYTES = 8 * 1024 * 1024
    const val DATA_BYTES = 2 * 1024 * 1024
    const val CHANGES = 100
    const val TEXT_LENGTH = 16_384
    const val ID_LENGTH = 128
    const val ITEMS = 2_000
    const val HOLIDAYS = 10_000
    const val DEPTH = 12
    const val MAX_VERSION = 9_007_199_254_740_990L
    val KINDS = setOf("mandalart", "block6", "monthly", "daily", "recurring", "holidays")
}

data class PlannerChange(
    val kind: String,
    val id: String,
    val expectedVersion: Long,
    val data: JsonNode?,
)

data class PlannerCommit(val requestId: UUID, val changes: List<PlannerChange>, val hash: String)

data class PlannerRecord(
    val kind: String,
    val id: String,
    val schemaVersion: Int = 1,
    val version: Long,
    val data: JsonNode?,
    val deleted: Boolean,
    val updatedAt: String,
)

data class PlannerSnapshot(val userId: UUID, val records: List<PlannerRecord>)
/** [snapshot] is null when the caller's validator matched [etag] (HTTP 304). */
data class ConditionalSnapshot(val etag: String, val snapshot: PlannerSnapshot?)

/** Immutable per-record metadata of an acknowledged write. Never includes plan data. */
data class RecordMetadata(
    val kind: String,
    val id: String,
    val schemaVersion: Int,
    val version: Long,
    val deleted: Boolean,
    val updatedAt: String,
) {
    fun toRecord(data: JsonNode?) = PlannerRecord(kind, id, schemaVersion, version, data, deleted, updatedAt)
    companion object {
        fun of(record: PlannerRecord) =
            RecordMetadata(record.kind, record.id, record.schemaVersion, record.version, record.deleted, record.updatedAt)
    }
}

/** Durable commit receipt body, format 2: metadata only, in request order. */
data class ReceiptV2(val format: Int = RECEIPT_FORMAT, val records: List<RecordMetadata>)
data class PlannerCommitResponse(val records: List<PlannerRecord>)
data class PlannerConflict(val kind: String, val id: String, val expectedVersion: Long, val actualVersion: Long)
@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlannerError(val error: String, val conflicts: List<PlannerConflict>? = null)

class PlannerException(val status: Int, val code: String, val conflicts: List<PlannerConflict>? = null) :
    RuntimeException(code)

internal fun valid(condition: Boolean) {
    if (!condition) throw PlannerException(400, "invalid_request")
}

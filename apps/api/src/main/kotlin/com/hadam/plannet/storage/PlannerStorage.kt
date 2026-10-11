package com.hadam.plannet.storage

import com.hadam.plannet.auth.domain.isStorableEmail
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.Base64
import java.util.UUID

/** All ownership predicates are derived from the verified OAuth identity, never from request data. */
class PlannerStorage(
    private val jdbc: JdbcTemplate,
    private val transaction: TransactionTemplate,
    private val mapper: JsonMapper,
) {
    /**
     * Maps (provider, subject) to the internal UUID. [verifiedEmail] is profile metadata from a verified claim only:
     * stored when new or changed, while null keeps the known value. An unchanged profile causes no write.
     */
    fun resolveUser(provider: String, subject: String, verifiedEmail: String? = null): UUID {
        valid(provider.isNotBlank() && provider.length <= 100 && '\u0000' !in provider)
        valid(subject.isNotBlank() && subject.length <= 512 && '\u0000' !in subject)
        valid(verifiedEmail == null || isStorableEmail(verifiedEmail))
        val find = {
            jdbc.query(
                "SELECT id, email FROM plannet_user WHERE provider = ? AND subject = ?",
                { row, _ -> row.getObject("id", UUID::class.java) to row.getString("email") }, provider, subject,
            ).singleOrNull()
        }
        return transaction.execute {
            val (id, email) = find() ?: run {
                jdbc.update(
                    "INSERT INTO plannet_user (id, provider, subject, email) VALUES (?, ?, ?, ?) ON CONFLICT (provider, subject) DO NOTHING",
                    UUID.randomUUID(), provider, subject, verifiedEmail,
                )
                find()!!
            }
            if (verifiedEmail != null && verifiedEmail != email) {
                jdbc.update("UPDATE plannet_user SET email = ? WHERE id = ? AND email IS DISTINCT FROM ?", verifiedEmail, id, verifiedEmail)
            }
            id
        }!!
    }

    fun snapshot(userId: UUID): PlannerSnapshot = PlannerSnapshot(userId, jdbc.query(
        "SELECT $RECORD_COLUMNS FROM planner_record WHERE user_id = ? ORDER BY kind, id",
        { row, _ -> record(row) }, userId,
    ))

    /**
     * Snapshot with an owner-scoped weak ETag computed from narrow metadata only. When one of [ifNoneMatch] matches,
     * the JSONB bodies are not selected at all. The account row is share-locked for the whole read so metadata and
     * bodies come from one generation (commits hold the same row FOR UPDATE).
     */
    fun conditionalSnapshot(userId: UUID, ifNoneMatch: List<String>): ConditionalSnapshot = transaction.execute {
        jdbc.queryForObject("SELECT id FROM plannet_user WHERE id = ? FOR SHARE", UUID::class.java, userId)
        val metadata = jdbc.query(
            "SELECT $METADATA_COLUMNS FROM planner_record WHERE user_id = ? ORDER BY kind, id",
            { row, _ -> metadata(row) }, userId,
        )
        val etag = snapshotEtag(userId, metadata)
        if (etagMatches(ifNoneMatch, etag)) ConditionalSnapshot(etag, null) else ConditionalSnapshot(etag, snapshot(userId))
    }!!

    fun commit(userId: UUID, commit: PlannerCommit): PlannerCommitResponse = transaction.execute {
        // Locks one account, including first creation/deletion of a record and duplicate request races.
        // Different accounts remain independent; one transaction never locks two owners.
        jdbc.queryForObject("SELECT id FROM plannet_user WHERE id = ? FOR UPDATE", UUID::class.java, userId)
        val receipt = jdbc.query(
            "SELECT request_hash, response::text FROM planner_commit_receipt WHERE user_id = ? AND request_id = ?",
            { row, _ -> row.getString("request_hash") to row.getString("response") }, userId, commit.requestId,
        ).singleOrNull()
        if (receipt != null) {
            if (receipt.first != commit.hash) throw PlannerException(409, "idempotency_conflict")
            return@execute replay(commit, receipt.second)
        }

        val conflicts = commit.changes.mapNotNull { change ->
            val version = jdbc.query(
                "SELECT version FROM planner_record WHERE user_id = ? AND kind = ? AND id = ?",
                { row, _ -> row.getLong("version") }, userId, change.kind, change.id,
            ).singleOrNull() ?: 0L
            if (version == change.expectedVersion) null else
                PlannerConflict(change.kind, change.id, change.expectedVersion, version)
        }
        if (conflicts.isNotEmpty()) throw PlannerException(409, "version_conflict", conflicts)

        val records = commit.changes.map { change ->
            val data = change.data
            val plan = data?.takeIf { change.kind !in setOf("recurring", "holidays") }
            jdbc.queryForObject(
                """
                INSERT INTO planner_record
                  (user_id, kind, id, schema_version, version, data, deleted, title, category,
                   plan_year, plan_month, plan_week, plan_day, updated_at)
                VALUES (?, ?, ?, 1, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, kind, id) DO UPDATE SET
                  schema_version = EXCLUDED.schema_version, version = EXCLUDED.version,
                  data = EXCLUDED.data, deleted = EXCLUDED.deleted, title = EXCLUDED.title,
                  category = EXCLUDED.category, plan_year = EXCLUDED.plan_year,
                  plan_month = EXCLUDED.plan_month, plan_week = EXCLUDED.plan_week,
                  plan_day = EXCLUDED.plan_day, updated_at = EXCLUDED.updated_at
                RETURNING $METADATA_COLUMNS
                """.trimIndent(),
                // The ACK carries the validated request data, exactly as a later replay reconstructs it.
                { row, _ -> metadata(row).toRecord(data) },
                userId, change.kind, change.id, change.expectedVersion + 1,
                data?.let { mapper.writeValueAsString(it) }, data == null,
                plan?.get("title")?.asString(), plan?.get("category")?.asString(),
                plan?.get("year")?.intValue(), plan?.get("month")?.intValue(),
                plan?.get("week")?.intValue(), plan?.get("day")?.intValue(),
            )!!
        }
        val response = PlannerCommitResponse(records)
        // Receipts keep only immutable metadata (format 2); plan bodies live once, in planner_record.
        val receiptBody = ReceiptV2(records = records.map { RecordMetadata.of(it) })
        jdbc.update(
            "INSERT INTO planner_commit_receipt (user_id, request_id, request_hash, response) VALUES (?, ?, ?, ?::jsonb)",
            userId, commit.requestId, commit.hash, mapper.writeValueAsString(receiptBody),
        )
        response
    }!!

    /**
     * Rebuilds the original ACK from the retried request (same hash, so same validated changes) and the stored
     * metadata. Never reads current planner_record data. A receipt that does not describe exactly these changes is
     * refused rather than returned.
     */
    private fun replay(commit: PlannerCommit, stored: String): PlannerCommitResponse {
        val receipt = try { mapper.readValue(stored, ReceiptV2::class.java) } catch (_: Exception) { null }
        if (receipt == null || receipt.format != RECEIPT_FORMAT || receipt.records.size != commit.changes.size) {
            throw PlannerException(409, "idempotency_conflict")
        }
        return PlannerCommitResponse(commit.changes.zip(receipt.records).map { (change, meta) ->
            if (meta.kind != change.kind || meta.id != change.id || meta.deleted != (change.data == null)
                || meta.version != change.expectedVersion + 1 || meta.schemaVersion != 1) {
                throw PlannerException(409, "idempotency_conflict")
            }
            meta.toRecord(change.data)
        })
    }

    private fun metadata(row: ResultSet) = RecordMetadata(
        kind = row.getString("kind"), id = row.getString("id"),
        schemaVersion = row.getInt("schema_version"), version = row.getLong("version"), deleted = row.getBoolean("deleted"),
        updatedAt = row.getObject("updated_at", OffsetDateTime::class.java).toInstant().toString(),
    )

    private fun record(row: ResultSet) = PlannerRecord(
        kind = row.getString("kind"), id = row.getString("id"),
        schemaVersion = row.getInt("schema_version"), version = row.getLong("version"),
        data = row.getString("data")?.let { mapper.readTree(it) }, deleted = row.getBoolean("deleted"),
        updatedAt = row.getObject("updated_at", OffsetDateTime::class.java).toInstant().toString(),
    )
}

internal const val RECEIPT_FORMAT = 2
private const val METADATA_COLUMNS = "kind, id, schema_version, version, deleted, updated_at"
private const val RECORD_COLUMNS = "kind, id, schema_version, version, data, deleted, updated_at"
private const val ETAG_SCHEME = "plannet-snapshot-v1"

/** Weak ETag over the owner and every record's narrow metadata, length-prefixed so field boundaries cannot collide. */
internal fun snapshotEtag(userId: UUID, records: List<RecordMetadata>): String {
    val digest = MessageDigest.getInstance("SHA-256")
    fun field(value: String) {
        val bytes = value.toByteArray(StandardCharsets.UTF_8)
        digest.update("${bytes.size}:".toByteArray(StandardCharsets.US_ASCII))
        digest.update(bytes)
    }
    field(ETAG_SCHEME)
    field(userId.toString())
    field(records.size.toString())
    records.forEach { record ->
        field(record.kind); field(record.id); field(record.schemaVersion.toString())
        field(record.version.toString()); field(record.deleted.toString()); field(record.updatedAt)
    }
    val hash = Base64.getUrlEncoder().withoutPadding().encodeToString(digest.digest())
    return "W/\"ps1-$hash\""
}

/**
 * If-None-Match with weak comparison for GET. Only an exact listed tag matches; `*` or anything unexpected never
 * produces a 304 (a full 200 is always safe).
 */
internal fun etagMatches(headers: List<String>, etag: String): Boolean {
    val opaque = etag.removePrefix("W/")
    return headers.flatMap { it.split(',') }.map { it.trim() }.any { candidate ->
        candidate.removePrefix("W/") == opaque
    }
}

package com.hadam.plannet.storage

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

/** All ownership predicates are derived from the verified OAuth identity, never from request data. */
class PlannerStorage(
    private val jdbc: JdbcTemplate,
    private val transaction: TransactionTemplate,
    private val mapper: JsonMapper,
) {
    fun resolveUser(provider: String, subject: String): UUID {
        valid(provider.isNotBlank() && provider.length <= 100 && '\u0000' !in provider)
        valid(subject.isNotBlank() && subject.length <= 512 && '\u0000' !in subject)
        return transaction.execute {
            jdbc.update(
                "INSERT INTO plannet_user (id, provider, subject) VALUES (?, ?, ?) ON CONFLICT (provider, subject) DO NOTHING",
                UUID.randomUUID(), provider, subject,
            )
            jdbc.queryForObject(
                "SELECT id FROM plannet_user WHERE provider = ? AND subject = ?", UUID::class.java, provider, subject,
            )!!
        }!!
    }

    fun snapshot(userId: UUID): PlannerSnapshot = PlannerSnapshot(userId, jdbc.query(
        "SELECT * FROM planner_record WHERE user_id = ? ORDER BY kind, id",
        { row, _ -> record(row) }, userId,
    ))

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
            return@execute mapper.readValue(receipt.second, PlannerCommitResponse::class.java)
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
                RETURNING *
                """.trimIndent(),
                { row, _ -> record(row) },
                userId, change.kind, change.id, change.expectedVersion + 1,
                data?.let { mapper.writeValueAsString(it) }, data == null,
                plan?.get("title")?.asString(), plan?.get("category")?.asString(),
                plan?.get("year")?.intValue(), plan?.get("month")?.intValue(),
                plan?.get("week")?.intValue(), plan?.get("day")?.intValue(),
            )!!
        }
        val response = PlannerCommitResponse(records)
        jdbc.update(
            "INSERT INTO planner_commit_receipt (user_id, request_id, request_hash, response) VALUES (?, ?, ?, ?::jsonb)",
            userId, commit.requestId, commit.hash, mapper.writeValueAsString(response),
        )
        response
    }!!

    private fun record(row: ResultSet) = PlannerRecord(
        kind = row.getString("kind"), id = row.getString("id"),
        schemaVersion = row.getInt("schema_version"), version = row.getLong("version"),
        data = row.getString("data")?.let { mapper.readTree(it) }, deleted = row.getBoolean("deleted"),
        updatedAt = row.getObject("updated_at", OffsetDateTime::class.java).toInstant().toString(),
    )
}

package com.hadam.plannet.storage

import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.ResultSetMetaData
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** ETag scheme and conditional-read query shape. No database: SQL is recorded, not executed. */
class PlannerSnapshotEtagTests {
    private val owner = UUID.fromString("10000000-0000-4000-8000-000000000001")
    private fun meta(id: String = "a", version: Long = 1, deleted: Boolean = false, updatedAt: String = "2026-09-28T00:00:00Z") =
        RecordMetadata("daily", id, 1, version, deleted, updatedAt)

    @Test
    fun `etag is weak, versioned, owner scoped and changes with any metadata field`() {
        val base = snapshotEtag(owner, listOf(meta()))
        assertTrue(base.startsWith("W/\"ps1-") && base.endsWith("\""))
        assertEquals(base, snapshotEtag(owner, listOf(meta())))
        assertNotEquals(base, snapshotEtag(UUID.randomUUID(), listOf(meta())))
        assertNotEquals(snapshotEtag(owner, emptyList()), snapshotEtag(UUID.randomUUID(), emptyList()))
        listOf(meta(version = 2), meta(deleted = true), meta(updatedAt = "2026-09-28T00:00:01Z"), meta(id = "b")).forEach {
            assertNotEquals(base, snapshotEtag(owner, listOf(it)))
        }
        // Length prefixes: moving characters between adjacent fields cannot collide.
        assertNotEquals(snapshotEtag(owner, listOf(RecordMetadata("daily", "ab", 1, 1, false, "c"))),
            snapshotEtag(owner, listOf(RecordMetadata("daily", "a", 1, 1, false, "bc"))))
    }

    @Test
    fun `if-none-match uses weak comparison over lists and never matches wildcard or garbage`() {
        val etag = snapshotEtag(owner, listOf(meta()))
        val strong = etag.removePrefix("W/")
        assertTrue(etagMatches(listOf(etag), etag))
        assertTrue(etagMatches(listOf(strong), etag))
        assertTrue(etagMatches(listOf("W/\"other\", $etag"), etag))
        assertTrue(etagMatches(listOf("\"other\"", " $etag "), etag))
        listOf(listOf(), listOf("*"), listOf("W/*"), listOf(""), listOf("W/\"ps1-\""), listOf(etag.dropLast(1))).forEach {
            assertFalse(etagMatches(it, etag), it.toString())
        }
    }

    @Test
    fun `a matching conditional read selects metadata only and never the JSONB bodies`() {
        val jdbc = RecordingJdbc(owner)
        val storage = PlannerStorage(jdbc, TransactionTemplate(NoTransactions), fixtureMapper)
        val first = storage.conditionalSnapshot(owner, emptyList())
        assertEquals(0, first.snapshot!!.records.size)
        assertTrue(jdbc.sql.any { it.contains("FOR SHARE") })
        assertTrue(jdbc.sql.any { it.contains(" data,") }, "a miss reads bodies")

        jdbc.sql.clear()
        val matched = storage.conditionalSnapshot(owner, listOf(first.etag))
        assertNull(matched.snapshot)
        assertEquals(first.etag, matched.etag)
        assertEquals(2, jdbc.sql.size, jdbc.sql.toString())
        assertTrue(jdbc.sql.none { it.contains("data") || it.contains("*") }, jdbc.sql.toString())
    }

    /** Real JdbcTemplate over a proxy DataSource: records every SQL string; the owner row exists, no records. */
    private class RecordingJdbc(private val owner: UUID) : JdbcTemplate() {
        val sql = mutableListOf<String>()
        init { dataSource = proxy<DataSource> { method, args -> if (method.name == "getConnection") connection() else null } }

        private fun connection(): Connection = proxy { method, args ->
            when (method.name) {
                "prepareStatement" -> { val text = args!![0] as String; sql += text; statement(text) }
                "getAutoCommit", "isClosed" -> false
                "getWarnings" -> null
                else -> null
            }
        }

        private fun statement(text: String): PreparedStatement = proxy { method, _ ->
            when (method.name) {
                "executeQuery" -> rows(if (text.contains("FROM plannet_user")) 1 else 0)
                "getWarnings" -> null
                "getUpdateCount" -> -1
                else -> null
            }
        }

        private fun rows(count: Int): ResultSet {
            var cursor = 0
            val metaData: ResultSetMetaData = proxy { method, _ -> if (method.name == "getColumnCount") 1 else null }
            return proxy { method, _ ->
                when (method.name) {
                    "next" -> ++cursor <= count
                    "getObject" -> owner
                    "getMetaData" -> metaData
                    "wasNull" -> false
                    "getWarnings" -> null
                    else -> null
                }
            }
        }

        private inline fun <reified T> proxy(crossinline handler: (Method, Array<Any?>?) -> Any?): T =
            Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, args ->
                if (method.name == "unwrap" || method.name == "isWrapperFor") false else handler(method, args)
            } as T
    }

    private object NoTransactions : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
        override fun commit(status: TransactionStatus) {}
        override fun rollback(status: TransactionStatus) {}
    }
}

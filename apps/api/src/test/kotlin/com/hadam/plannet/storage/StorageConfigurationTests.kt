package com.hadam.plannet.storage

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class StorageConfigurationTests {
    private val context = ApplicationContextRunner().withUserConfiguration(StorageConfiguration::class.java)
        .withBean(JsonMapper::class.java, { JsonMapper.builder().build() })

    @Test
    fun `disabled storage creates no database pool even with missing credentials`() {
        context.withPropertyValues("plannet.storage.enabled=false").run {
            assertTrue(it.getBeansOfType(PlannerStorage::class.java).isEmpty())
            assertTrue(it.getBeansOfType(javax.sql.DataSource::class.java).isEmpty())
        }
    }

    @Test
    fun `enabled storage requires all credentials and only PostgreSQL URLs`() {
        listOf(
            listOf("", "", ""),
            listOf("jdbc:postgresql://localhost/test", "user", ""),
            listOf("jdbc:h2:mem:test", "user", "password"),
        ).forEach { values ->
            context.withPropertyValues("plannet.storage.enabled=true", "plannet.storage.url=${values[0]}",
                "plannet.storage.username=${values[1]}", "plannet.storage.password=${values[2]}").run {
                assertNotNull(it.startupFailure)
            }
        }
    }
}

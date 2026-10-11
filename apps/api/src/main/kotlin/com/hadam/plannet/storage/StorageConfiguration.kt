package com.hadam.plannet.storage

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "plannet.storage", name = ["enabled"], havingValue = "true")
class StorageConfiguration {
    @Bean(destroyMethod = "close")
    fun plannerDataSource(
        @Value("\${plannet.storage.url}") url: String,
        @Value("\${plannet.storage.username}") username: String,
        @Value("\${plannet.storage.password}") password: String,
    ): HikariDataSource {
        require(url.startsWith("jdbc:postgresql:") && username.isNotBlank() && password.isNotBlank()) {
            "Storage requires PLANNET_DB_URL (PostgreSQL), PLANNET_DB_USERNAME and PLANNET_DB_PASSWORD"
        }
        return HikariDataSource(HikariConfig().apply {
            jdbcUrl = url
            this.username = username
            this.password = password
            maximumPoolSize = 8
            minimumIdle = 1
            connectionTimeout = 3_000
            validationTimeout = 2_000
            initializationFailTimeout = 5_000
            poolName = "plannet-storage"
            addDataSourceProperty("connectTimeout", "3")
            addDataSourceProperty("socketTimeout", "15")
            connectionInitSql = "SET statement_timeout = '15s'"
        })
    }

    @Bean
    fun plannerFlyway(plannerDataSource: HikariDataSource): Flyway = Flyway.configure()
        .dataSource(plannerDataSource)
        .locations("classpath:db/migration")
        .cleanDisabled(true)
        .load().also { it.migrate() }

    @Bean
    fun plannerStorage(
        plannerDataSource: HikariDataSource,
        plannerFlyway: Flyway,
        jsonMapper: JsonMapper,
    ): PlannerStorage = PlannerStorage(
        JdbcTemplate(plannerDataSource),
        TransactionTemplate(DataSourceTransactionManager(plannerDataSource)),
        jsonMapper,
    )
}

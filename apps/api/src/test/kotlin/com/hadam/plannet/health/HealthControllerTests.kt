package com.hadam.plannet.health

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
class HealthControllerTests @Autowired constructor(
    private val mockMvc: MockMvc,
) {
    @Test
    fun `returns api health`() {
        mockMvc.get("/api/v1/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.status", equalTo("UP"))
            }
    }
}

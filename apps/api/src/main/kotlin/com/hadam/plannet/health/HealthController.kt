package com.hadam.plannet.health

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/health")
class HealthController {
    @GetMapping
    fun getHealth(): HealthResponse = HealthResponse(status = "UP")
}

data class HealthResponse(
    val status: String,
)

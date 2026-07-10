package com.hadam.plannet

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class PlannetApiApplication

fun main(args: Array<String>) {
    runApplication<PlannetApiApplication>(*args)
}

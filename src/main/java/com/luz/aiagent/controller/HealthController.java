package com.luz.aiagent.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequestMapping("/health")
public class HealthController {

    @Value("${spring.application.name:gqldjob-backend}")
    private String applicationName;

    @Value("${APP_VERSION:0.0.1-SNAPSHOT}")
    private String version;

    @GetMapping
    public Map<String, Object> healthCheck() {
        return Map.of(
                "status", "UP",
                "time", OffsetDateTime.now().toString(),
                "application", applicationName,
                "version", version
        );
    }
}

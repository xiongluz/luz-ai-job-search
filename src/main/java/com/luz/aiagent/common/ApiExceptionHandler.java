package com.luz.aiagent.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatusException(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", error.getStatusCode().value(),
                "error", error.getStatusCode().toString(),
                "message", error.getReason() == null ? "请求处理失败。" : error.getReason()
        ));
    }
}

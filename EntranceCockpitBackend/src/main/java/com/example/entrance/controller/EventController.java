package com.example.entrance.controller;

import com.example.entrance.model.MonitoringEvent;
import com.example.entrance.service.EventStreamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventStreamService generator;

    public EventController(EventStreamService generator) {
        this.generator = generator;
    }

    @PostMapping
    public ResponseEntity<MonitoringEvent> pushEvent(@RequestBody Map<String, Object> body) {
        MonitoringEvent event = new MonitoringEvent(
                UUID.randomUUID().toString(),
                (String) body.getOrDefault("type", "custom_event"),
                Instant.now(),
                (String) body.getOrDefault("device_id", "manual-trigger"),
                (Map<String, Object>) body.getOrDefault("data", Map.of())
        );
        generator.publish(event);
        return ResponseEntity.accepted().body(event);
    }
}

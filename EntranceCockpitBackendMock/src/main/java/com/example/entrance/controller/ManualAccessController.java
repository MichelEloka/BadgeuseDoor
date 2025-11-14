package com.example.entrance.controller;

import com.example.entrance.model.MonitoringEvent;
import com.example.entrance.service.MockDirectoryService;
import com.example.entrance.service.MockEventGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/mock/manual-access")
public class ManualAccessController {

    private final MockEventGenerator generator;
    private final MockDirectoryService directoryService;

    public ManualAccessController(
            MockEventGenerator generator,
            MockDirectoryService directoryService
    ) {
        this.generator = generator;
        this.directoryService = directoryService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> approve(@RequestBody Map<String, String> body) {
        String requestedDoor = body.getOrDefault("doorId", body.getOrDefault("doorID", "")).trim();
        String doorId = requestedDoor;
        if (!StringUtils.hasText(doorId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Door ID is required"));
        }
        if (!directoryService.doorIds().isEmpty() && !directoryService.doorIds().contains(doorId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Unknown door ID"));
        }

        MonitoringEvent event = MonitoringEvent.manualOverride(doorId);
        generator.publish(event);

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "status", "accepted",
                "doorId", doorId,
                "doorID", doorId,
                "message", "Door opening triggered manually"
        ));
    }
}

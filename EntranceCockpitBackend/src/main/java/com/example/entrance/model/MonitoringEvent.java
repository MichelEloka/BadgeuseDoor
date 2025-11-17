package com.example.entrance.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record MonitoringEvent(
        String id,
        String type,
        Instant ts,
        @JsonProperty("device_id") String deviceId,
        Map<String, Object> data
) {
    public static MonitoringEvent badgeAttempt(String badgeId, String doorId, boolean success, String deviceId) {
        return new MonitoringEvent(
                UUID.randomUUID().toString(),
                "badge_event",
                Instant.now(),
                deviceId,
                Map.of(
                        "badgeID", badgeId,
                        "doorID", doorId,
                        "success", success
                )
        );
    }

    public static MonitoringEvent manualOverride(String doorId) {
        return new MonitoringEvent(
                UUID.randomUUID().toString(),
                "manual_override",
                Instant.now(),
                "manual-access-panel",
                Map.of(
                        "doorID", doorId,
                        "success", true
                )
        );
    }
}

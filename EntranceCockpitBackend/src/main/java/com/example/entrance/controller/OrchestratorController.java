package com.example.entrance.controller;

import com.example.entrance.model.DeviceRecord;
import com.example.entrance.service.DeviceRegistryService;
import com.example.entrance.service.FloorPlanService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/orchestrator")
public class OrchestratorController {

    private final FloorPlanService floorPlanService;
    private final DeviceRegistryService deviceRegistryService;

    public OrchestratorController(FloorPlanService floorPlanService, DeviceRegistryService deviceRegistryService) {
        this.floorPlanService = floorPlanService;
        this.deviceRegistryService = deviceRegistryService;
    }

    @GetMapping("/plans/{floorId}")
    public ResponseEntity<?> getPlan(@PathVariable String floorId) {
        return floorPlanService.getPlan(floorId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/plans/{floorId}")
    public ResponseEntity<Void> savePlan(@PathVariable String floorId, @RequestBody Map<String, Object> payload) {
        floorPlanService.savePlan(floorId, payload);
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/devices")
    public List<Map<String, Object>> listDevices() {
        return deviceRegistryService.findAll().stream()
                .map(record -> Map.<String, Object>of(
                        "id", record.id(),
                        "kind", record.type(),
                        "ready", true
                ))
                .toList();
    }

    @PostMapping("/devices")
    public ResponseEntity<?> createDevice(@RequestBody Map<String, String> payload) {
        String kind = payload.getOrDefault("kind", payload.getOrDefault("type", ""));
        if (!StringUtils.hasText(kind)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device kind is required"));
        }
        String preferredId = payload.getOrDefault("device_id", payload.getOrDefault("deviceId", null));
        String doorId = payload.getOrDefault("door_id", payload.getOrDefault("doorId", null));
        try {
            DeviceRecord record = deviceRegistryService.register(kind, preferredId, doorId);
            return ResponseEntity.ok(record);
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(409).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/devices/{deviceId}")
    public ResponseEntity<Void> removeDevice(@PathVariable String deviceId, @RequestParam(name = "remove_image", required = false) String ignore) {
        deviceRegistryService.delete(deviceId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/door/{doorId}/{action}")
    public ResponseEntity<Map<String, Object>> doorCommand(@PathVariable String doorId, @PathVariable String action) {
        if (!StringUtils.hasText(doorId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Door ID required"));
        }
        if (!deviceRegistryService.doorExists(doorId)) {
            return ResponseEntity.status(404).body(Map.of("message", "Unknown door"));
        }
        return ResponseEntity.accepted().body(Map.of(
                "doorId", doorId,
                "action", action,
                "status", "accepted"
        ));
    }
}

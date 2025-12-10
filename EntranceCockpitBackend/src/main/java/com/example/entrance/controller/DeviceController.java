package com.example.entrance.controller;

import com.example.entrance.model.DeviceRecord;
import com.example.entrance.service.DeviceRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceRegistryService registryService;

    public DeviceController(DeviceRegistryService registryService) {
        this.registryService = registryService;
    }

    @GetMapping
    public List<DeviceRecord> list() {
        return registryService.findAll();
    }

    @GetMapping("/{deviceId}")
    public ResponseEntity<?> getOne(@PathVariable("deviceId") String deviceId) {
        if (!StringUtils.hasText(deviceId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device ID is required"));
        }
        DeviceRecord record = registryService.findOne(deviceId.trim());
        if (record == null) {
            return ResponseEntity.status(404).body(Map.of("message", "Device not found"));
        }
        return ResponseEntity.ok(record);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        String type = body.getOrDefault("type", "").trim();
        String preferredId = body.getOrDefault("deviceId", body.getOrDefault("id", "")).trim();
        String targetDoorId = body.getOrDefault("doorId",
                body.getOrDefault("targetDoorId", body.getOrDefault("door_id", ""))).trim();
        if (!StringUtils.hasText(type)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device type is required"));
        }
        try {
            DeviceRecord record = registryService.register(type, preferredId.isEmpty() ? null : preferredId,
                    StringUtils.hasText(targetDoorId) ? targetDoorId : null);
            return ResponseEntity.ok(record);
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(409).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<?> delete(@PathVariable("deviceId") String deviceId) {
        if (!StringUtils.hasText(deviceId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device ID is required"));
        }
        boolean removed = registryService.delete(deviceId.trim());
        if (!removed) {
            return ResponseEntity.status(404).body(Map.of("message", "Device not found"));
        }
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{deviceId}")
    public ResponseEntity<?> patch(@PathVariable("deviceId") String deviceId, @RequestBody Map<String, Object> body) {
        if (!StringUtils.hasText(deviceId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device ID is required"));
        }
        Object rawLocation = body.get("location");
        Object rawZone = body.get("zone");
        String location = rawLocation == null ? null : rawLocation.toString();
        String zone = rawZone == null ? null : rawZone.toString();
        String target = StringUtils.hasText(zone) ? zone : location;
        try {
            DeviceRecord updated = registryService.updateLocation(deviceId.trim(), target);
            if (updated == null) {
                return ResponseEntity.status(404).body(Map.of("message", "Device not found"));
            }
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        }
    }
}

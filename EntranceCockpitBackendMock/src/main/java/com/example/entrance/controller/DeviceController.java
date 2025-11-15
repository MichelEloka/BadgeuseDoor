package com.example.entrance.controller;

import com.example.entrance.model.DeviceRecord;
import com.example.entrance.service.DeviceRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mock/devices")
public class DeviceController {

    private final DeviceRegistryService registryService;

    public DeviceController(DeviceRegistryService registryService) {
        this.registryService = registryService;
    }

    @GetMapping
    public List<DeviceRecord> list() {
        return registryService.findAll();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        String type = body.getOrDefault("type", "").trim();
        String preferredId = body.getOrDefault("deviceId", body.getOrDefault("id", "")).trim();
        if (!StringUtils.hasText(type)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Device type is required"));
        }
        try {
            DeviceRecord record = registryService.register(type, preferredId.isEmpty() ? null : preferredId);
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
}

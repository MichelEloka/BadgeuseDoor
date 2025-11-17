package com.example.entrance.service;

import com.example.entrance.model.DeviceRecord;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class DeviceRegistryService {

    private final ConcurrentMap<String, DeviceRecord> devices = new ConcurrentHashMap<>();
    private final AtomicInteger sequence = new AtomicInteger(100);

    public DeviceRegistryService(MockDirectoryService directoryService) {
        directoryService.doorIds().forEach(id -> devices.put(id, new DeviceRecord(id, "porte", Instant.now(), true, null)));
    }

    public List<DeviceRecord> findAll() {
        return List.copyOf(devices.values());
    }

    public DeviceRecord register(String type, String preferredId) {
        if (!StringUtils.hasText(type)) {
            throw new IllegalArgumentException("Device type is required");
        }
        String normalizedType = type.trim().toLowerCase();
        String finalId = StringUtils.hasText(preferredId) ? preferredId.trim() : generateId(normalizedType);
        if (devices.containsKey(finalId)) {
            throw new IllegalStateException("Device ID already exists");
        }
        DeviceRecord record = new DeviceRecord(finalId, normalizedType, Instant.now(), false, null);
        devices.put(finalId, record);
        return record;
    }

    public boolean delete(String deviceId) {
        if (!StringUtils.hasText(deviceId)) {
            return false;
        }
        return devices.remove(deviceId.trim()) != null;
    }

    public DeviceRecord updateLocation(String deviceId, String location) {
        if (!StringUtils.hasText(deviceId)) {
            throw new IllegalArgumentException("Device ID is required");
        }
        String normalizedLocation = StringUtils.hasText(location) ? location.trim() : null;
        return devices.computeIfPresent(deviceId.trim(), (key, existing) ->
                new DeviceRecord(existing.id(), existing.type(), existing.createdAt(), existing.builtin(), normalizedLocation)
        );
    }

    private String generateId(String type) {
        return type + "-" + String.format("%03d", sequence.getAndIncrement());
    }
}

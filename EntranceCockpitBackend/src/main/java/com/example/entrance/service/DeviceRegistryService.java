package com.example.entrance.service;

import com.example.entrance.entity.DeviceEntity;
import com.example.entrance.model.DeviceRecord;
import com.example.entrance.repository.DeviceRepository;
import com.example.entrance.service.simulator.SimulatorClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional
public class DeviceRegistryService {

    private final DeviceRepository repository;
    private final SimulatorClient simulatorClient;

    public DeviceRegistryService(DeviceRepository repository, SimulatorClient simulatorClient) {
        this.repository = repository;
        this.simulatorClient = simulatorClient;
    }

    @Transactional(readOnly = true)
    public List<DeviceRecord> findAll() {
        return repository.findAll().stream().map(this::toRecord).toList();
    }

    public DeviceRecord register(String type, String preferredId, String targetDoorId) {
        if (!StringUtils.hasText(type)) {
            throw new IllegalArgumentException("Device type is required");
        }
        String normalizedType = type.trim().toLowerCase();
        String finalId = StringUtils.hasText(preferredId) ? preferredId.trim() : generateId(normalizedType);
        if (repository.existsByDeviceIdIgnoreCase(finalId)) {
            throw new IllegalStateException("Device ID already exists");
        }

        simulatorClient.createDevice(normalizedType, finalId, targetDoorId);

        DeviceEntity entity = new DeviceEntity();
        entity.setDeviceId(finalId);
        entity.setType(normalizedType);
        entity.setBuiltin(false);
        entity.setLocation(null);
        entity.setCreatedAt(Instant.now());
        DeviceEntity saved = repository.save(entity);
        return toRecord(saved);
    }

    public boolean delete(String deviceId) {
        if (!StringUtils.hasText(deviceId)) {
            return false;
        }
        simulatorClient.deleteDevice(deviceId.trim());

        return repository.findByDeviceIdIgnoreCase(deviceId.trim())
                .map(entity -> {
                    repository.delete(entity);
                    return true;
                })
                .orElse(false);
    }

    public DeviceRecord updateLocation(String deviceId, String location) {
        if (!StringUtils.hasText(deviceId)) {
            throw new IllegalArgumentException("Device ID is required");
        }
        return repository.findByDeviceIdIgnoreCase(deviceId.trim())
                .map(entity -> {
                    entity.setLocation(StringUtils.hasText(location) ? location.trim() : null);
                    DeviceEntity updated = repository.save(entity);
                    return toRecord(updated);
                })
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean doorExists(String doorId) {
        if (!StringUtils.hasText(doorId)) {
            return false;
        }
        return repository.findByDeviceIdIgnoreCase(doorId.trim())
                .map(entity -> "door".equalsIgnoreCase(entity.getType()) || "porte".equalsIgnoreCase(entity.getType()))
                .orElse(false);
    }

    private String generateId(String type) {
        String candidate;
        do {
            long random = ThreadLocalRandom.current().nextLong(Long.MAX_VALUE);
            candidate = type + "-" + Long.toHexString(random);
        } while (repository.existsByDeviceIdIgnoreCase(candidate));
        return candidate;
    }

    private DeviceRecord toRecord(DeviceEntity entity) {
        return new DeviceRecord(
                entity.getDeviceId(),
                entity.getType(),
                entity.getCreatedAt(),
                entity.isBuiltin(),
                entity.getLocation()
        );
    }
}

package com.example.entrance.service;

import com.example.entrance.entity.DeviceEntity;
import com.example.entrance.entity.ZoneEntity;
import com.example.entrance.model.DeviceRecord;
import com.example.entrance.repository.DeviceRepository;
import com.example.entrance.repository.ZoneRepository;
import com.example.entrance.service.simulator.SimulatorClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class DeviceRegistryService {

    private final DeviceRepository repository;
    private final ZoneRepository zoneRepository;
    private final SimulatorClient simulatorClient;

    public DeviceRegistryService(DeviceRepository repository, ZoneRepository zoneRepository, SimulatorClient simulatorClient) {
        this.repository = repository;
        this.zoneRepository = zoneRepository;
        this.simulatorClient = simulatorClient;
    }

    @Transactional(readOnly = true)
    public List<DeviceRecord> findAll() {
        return repository.findAll().stream().map(this::toRecord).toList();
    }

    @Transactional(readOnly = true)
    public DeviceRecord findOne(String deviceId) {
        if (!StringUtils.hasText(deviceId)) {
            return null;
        }
        return repository.findByDeviceIdIgnoreCase(deviceId.trim())
                .map(this::toRecord)
                .orElse(null);
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
        // Pour les badgeuses, on stocke l'ID de la porte cible dans "location"
        if ("badgeuse".equalsIgnoreCase(normalizedType)) {
            entity.setLocation(StringUtils.hasText(targetDoorId) ? targetDoorId : null);
        } else {
            entity.setLocation(null);
        }
        entity.setZones(new HashSet<>());
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

    public DeviceRecord updateLocation(String deviceId, String location, List<String> zoneNames) {
        if (!StringUtils.hasText(deviceId)) {
            throw new IllegalArgumentException("Device ID is required");
        }
        return repository.findByDeviceIdIgnoreCase(deviceId.trim())
                .map(entity -> {
                    // Pour une badgeuse, "location" transporte l'ID de la porte cible.
                    // Pour une porte, on persiste la zone dans le champ dédié ET on expose aussi via location pour compat.
                    String cleanedLocation = StringUtils.hasText(location) ? location.trim() : null;

                    Set<ZoneEntity> resolved = resolveZones(zoneNames);
                    String firstZone = resolved.stream().findFirst().map(ZoneEntity::getName).orElse(null);

                    if ("badgeuse".equalsIgnoreCase(entity.getType())) {
                        entity.setLocation(cleanedLocation);
                    } else {
                        entity.setLocation(firstZone);
                    }
                    entity.setZones(resolved);
                    DeviceEntity updated = repository.save(entity);
                    refreshZoneDeviceIds(resolved, entity.getDeviceId());
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

    private DeviceRecord toRecord(DeviceEntity entity) {
        List<String> zoneNames = entity.getZones() == null
                ? Collections.emptyList()
                : entity.getZones().stream()
                .map(ZoneEntity::getName)
                .filter(Objects::nonNull)
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        return new DeviceRecord(
                entity.getDeviceId(),
                entity.getType(),
                entity.getCreatedAt(),
                entity.isBuiltin(),
                entity.getLocation(),
                "badgeuse".equalsIgnoreCase(entity.getType()) ? entity.getLocation() : null,
                zoneNames
        );
    }

    private String generateId(String type) {
        long next = repository.findTopByOrderByIdDesc()
                .map(DeviceEntity::getId)
                .orElse(0L) + 1L;
        String prefix;
        if ("porte".equalsIgnoreCase(type) || "door".equalsIgnoreCase(type)) {
            prefix = "porte-";
        } else {
            prefix = "badgeuse-";
        }
        return prefix + next;
    }

    private Set<ZoneEntity> resolveZones(List<String> zoneNames) {
        if (zoneNames == null || zoneNames.isEmpty()) {
            return new HashSet<>();
        }
        Set<String> normalized = zoneNames.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(() -> new TreeSet<>(String.CASE_INSENSITIVE_ORDER)));

        Set<ZoneEntity> zones = new HashSet<>();
        for (String name : normalized) {
            ZoneEntity zone = zoneRepository.findByNameIgnoreCase(name)
                    .orElseGet(() -> {
                        ZoneEntity created = new ZoneEntity();
                        created.setName(name);
                        return zoneRepository.save(created);
                    });
            zones.add(zone);
        }
        return zones;
    }

    private void refreshZoneDeviceIds(Set<ZoneEntity> zones, String currentDeviceId) {
        if (zones == null || zones.isEmpty()) {
            return;
        }
        for (ZoneEntity zone : zones) {
            Set<String> ids = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
            if (zone.getDevices() != null) {
                for (DeviceEntity device : zone.getDevices()) {
                    if (StringUtils.hasText(device.getDeviceId())) {
                        ids.add(device.getDeviceId());
                    }
                }
            }
            if (StringUtils.hasText(currentDeviceId)) {
                ids.add(currentDeviceId);
            }
            zone.setDeviceIds(String.join(",", ids));
        }
        zoneRepository.saveAll(zones);
    }
}

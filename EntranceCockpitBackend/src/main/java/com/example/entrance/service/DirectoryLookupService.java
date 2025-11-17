package com.example.entrance.service;

import com.example.entrance.entity.DeviceEntity;
import com.example.entrance.entity.PersonEntity;
import com.example.entrance.repository.DeviceRepository;
import com.example.entrance.repository.PersonRepository;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class DirectoryLookupService {

    private static final List<String> FALLBACK_DOORS = List.of("door-fallback-1", "door-fallback-2");
    private static final List<String> FALLBACK_BADGES = List.of("BADGE-FALLBACK-1", "BADGE-FALLBACK-2");
    private static final List<String> FALLBACK_DEVICES = List.of("reader-fallback-1");

    private final DeviceRepository deviceRepository;
    private final PersonRepository personRepository;

    public DirectoryLookupService(DeviceRepository deviceRepository, PersonRepository personRepository) {
        this.deviceRepository = deviceRepository;
        this.personRepository = personRepository;
    }

    public List<String> doorIds() {
        List<String> ids = deviceRepository.findAll().stream()
                .filter(entity -> "door".equalsIgnoreCase(entity.getType()) || "porte".equalsIgnoreCase(entity.getType()))
                .map(DeviceEntity::getDeviceId)
                .toList();
        return ids.isEmpty() ? FALLBACK_DOORS : ids;
    }

    public List<String> badgeIds() {
        List<String> ids = personRepository.findAll().stream()
                .map(PersonEntity::getBadgeId)
                .filter(id -> id != null && !id.isBlank())
                .toList();
        return ids.isEmpty() ? FALLBACK_BADGES : ids;
    }

    public List<String> deviceIds() {
        List<String> ids = deviceRepository.findAll().stream()
                .map(DeviceEntity::getDeviceId)
                .toList();
        return ids.isEmpty() ? FALLBACK_DEVICES : ids;
    }

    public String randomDoorId() {
        return pickRandom(doorIds(), FALLBACK_DOORS.get(0));
    }

    public String randomBadgeId() {
        return pickRandom(badgeIds(), FALLBACK_BADGES.get(0));
    }

    public String randomDeviceId() {
        return pickRandom(deviceIds(), FALLBACK_DEVICES.get(0));
    }

    public String randomUnknownBadgeId() {
        return "UNKNOWN-" + (1000 + ThreadLocalRandom.current().nextInt(9000));
    }

    private String pickRandom(List<String> source, String fallback) {
        if (CollectionUtils.isEmpty(source)) {
            return fallback;
        }
        return source.get(ThreadLocalRandom.current().nextInt(source.size()));
    }
}

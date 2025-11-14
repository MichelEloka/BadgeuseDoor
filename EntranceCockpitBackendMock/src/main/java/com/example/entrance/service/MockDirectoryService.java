package com.example.entrance.service;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class MockDirectoryService {

    private static final List<String> DOOR_IDS = List.of("door-001", "door-002", "door-003");
    private static final List<String> BADGE_IDS = List.of("BADGE-001", "BADGE-002", "BADGE-003", "BADGE-004");
    private static final List<String> DEVICE_IDS = List.of("badge-reader-01", "badge-reader-02");

    public List<String> doorIds() {
        return DOOR_IDS;
    }

    public List<String> badgeIds() {
        return BADGE_IDS;
    }

    public List<String> deviceIds() {
        return DEVICE_IDS;
    }

    public String randomDoorId() {
        return DOOR_IDS.get(ThreadLocalRandom.current().nextInt(DOOR_IDS.size()));
    }

    public String randomBadgeId() {
        return BADGE_IDS.get(ThreadLocalRandom.current().nextInt(BADGE_IDS.size()));
    }

    public String randomDeviceId() {
        return DEVICE_IDS.get(ThreadLocalRandom.current().nextInt(DEVICE_IDS.size()));
    }

    public String randomUnknownBadgeId() {
        return "UNKNOWN-" + (1000 + ThreadLocalRandom.current().nextInt(9000));
    }
}

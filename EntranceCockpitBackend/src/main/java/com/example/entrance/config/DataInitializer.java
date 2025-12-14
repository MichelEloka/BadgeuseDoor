package com.example.entrance.config;

import com.example.entrance.entity.DeviceEntity;
import com.example.entrance.entity.FloorPlanEntity;
import com.example.entrance.entity.PersonEntity;
import com.example.entrance.entity.ZoneEntity;
import com.example.entrance.repository.DeviceRepository;
import com.example.entrance.repository.FloorPlanRepository;
import com.example.entrance.repository.PersonRepository;
import com.example.entrance.repository.ZoneRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Injecte quelques données par défaut pour faciliter le démarrage en local/demo.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final DeviceRepository deviceRepository;
    private final ZoneRepository zoneRepository;
    private final FloorPlanRepository floorPlanRepository;
    private final PersonRepository personRepository;

    @Value("${app.sample-data.enabled:true}")
    private boolean sampleDataEnabled;

    public DataInitializer(DeviceRepository deviceRepository,
                           ZoneRepository zoneRepository,
                           FloorPlanRepository floorPlanRepository,
                           PersonRepository personRepository) {
        this.deviceRepository = deviceRepository;
        this.zoneRepository = zoneRepository;
        this.floorPlanRepository = floorPlanRepository;
        this.personRepository = personRepository;
    }

    @Override
    public void run(String... args) {
        if (!sampleDataEnabled) {
            return;
        }

        ZoneEntity zone = ensureZone("Zone A");
        DeviceEntity door = ensureDevice("porte-1", "porte", zone.getName(), Set.of(zone));
        DeviceEntity badgeuse = ensureDevice("badgeuse-1", "badgeuse", door.getDeviceId(), Set.of(zone));
        updateZoneDeviceIds(zone, List.of(door, badgeuse));
        ensurePerson();
        ensureFloorPlan(door.getDeviceId(), badgeuse.getDeviceId());
    }

    private ZoneEntity ensureZone(String name) {
        return zoneRepository.findByNameIgnoreCase(name)
                .orElseGet(() -> {
                    ZoneEntity z = new ZoneEntity();
                    z.setName(name);
                    z.setCreatedAt(Instant.now());
                    return zoneRepository.save(z);
                });
    }

    private DeviceEntity ensureDevice(String deviceId, String type, String location, Set<ZoneEntity> zones) {
        return deviceRepository.findByDeviceIdIgnoreCase(deviceId)
                .orElseGet(() -> {
                    DeviceEntity d = new DeviceEntity();
                    d.setDeviceId(deviceId);
                    d.setType(type);
                    d.setLocation(location);
                    d.setZones(new HashSet<>(zones));
                    d.setBuiltin(true);
                    d.setCreatedAt(Instant.now());
                    return deviceRepository.save(d);
                });
    }

    private void updateZoneDeviceIds(ZoneEntity zone, List<DeviceEntity> devices) {
        Set<String> ids = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        if (StringUtils.hasText(zone.getDeviceIds())) {
            for (String id : zone.getDeviceIds().split(",")) {
                if (StringUtils.hasText(id)) {
                    ids.add(id.trim());
                }
            }
        }
        for (DeviceEntity device : devices) {
            if (StringUtils.hasText(device.getDeviceId())) {
                ids.add(device.getDeviceId().trim());
            }
        }
        zone.setDeviceIds(String.join(",", ids));
        zoneRepository.save(zone);
    }

    private void ensurePerson() {
        String badgeId = "BADGE-001";
        if (personRepository.existsByBadgeIdIgnoreCase(badgeId)) {
            return;
        }
        PersonEntity p = new PersonEntity();
        p.setFirstName("Alice");
        p.setLastName("Martin");
        p.setEmail("alice.martin@example.com");
        p.setRole("admin");
        p.setBadgeId(badgeId);
        p.setLastEntry(Instant.now());
        personRepository.save(p);
    }

    private void ensureFloorPlan(String doorDeviceId, String badgeDeviceId) {
        String floorId = "etage-1";
        if (floorPlanRepository.existsById(floorId)) {
            return;
        }
        FloorPlanEntity fp = new FloorPlanEntity();
        fp.setId(floorId);
        fp.setContent(buildSamplePlanJson(floorId, doorDeviceId, badgeDeviceId));
        fp.setUpdatedAt(Instant.now());
        floorPlanRepository.save(fp);
    }

    private String buildSamplePlanJson(String floorId, String doorDeviceId, String badgeDeviceId) {
        return """
                {
                  "id": "%s",
                  "name": "Etage 1",
                  "width": 1400,
                  "height": 900,
                  "walls": [],
                  "nodes": [
                    {"id": "door-node-1", "kind": "porte", "deviceId": "%s", "x": 420, "y": 380, "rot": 0, "hinge": "left"},
                    {"id": "badgeuse-node-1", "kind": "badgeuse", "deviceId": "%s", "x": 520, "y": 520, "targetDoorId": "%s"}
                  ],
                  "zones": [
                    {
                      "id": "zone-1",
                      "name": "Zone A",
                      "points": [
                        {"x": 300, "y": 300},
                        {"x": 700, "y": 300},
                        {"x": 700, "y": 700},
                        {"x": 300, "y": 700}
                      ]
                    }
                  ],
                  "simPersons": []
                }
                """.formatted(floorId, doorDeviceId, badgeDeviceId, doorDeviceId);
    }
}

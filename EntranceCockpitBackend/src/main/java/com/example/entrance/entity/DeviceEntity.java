package com.example.entrance.entity;

import com.example.entrance.entity.ZoneEntity;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "devices")
public class DeviceEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id", nullable = false, unique = true)
    private String deviceId;

    @Column(nullable = false)
    private String type;

    @Column
    private String location;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "device_zones",
            joinColumns = @JoinColumn(name = "device_pk"),
            inverseJoinColumns = @JoinColumn(name = "zone_pk")
    )
    private Set<ZoneEntity> zones = new HashSet<>();

    @Column(nullable = false)
    private boolean builtin = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public Set<ZoneEntity> getZones() {
        return zones;
    }

    public void setZones(Set<ZoneEntity> zones) {
        this.zones = zones;
    }

    public boolean isBuiltin() {
        return builtin;
    }

    public void setBuiltin(boolean builtin) {
        this.builtin = builtin;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}

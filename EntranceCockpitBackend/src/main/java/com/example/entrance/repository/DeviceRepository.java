package com.example.entrance.repository;

import com.example.entrance.entity.DeviceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<DeviceEntity, Long> {

    Optional<DeviceEntity> findByDeviceIdIgnoreCase(String deviceId);

    boolean existsByDeviceIdIgnoreCase(String deviceId);

    List<DeviceEntity> findByTypeIgnoreCase(String type);

    Optional<DeviceEntity> findTopByOrderByIdDesc();
}

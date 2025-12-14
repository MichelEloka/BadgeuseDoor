package com.example.entrance.repository;

import com.example.entrance.entity.ZoneEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ZoneRepository extends JpaRepository<ZoneEntity, Long> {
    Optional<ZoneEntity> findByNameIgnoreCase(String name);
}

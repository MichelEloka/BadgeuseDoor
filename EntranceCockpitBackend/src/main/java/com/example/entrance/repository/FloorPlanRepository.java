package com.example.entrance.repository;

import com.example.entrance.entity.FloorPlanEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FloorPlanRepository extends JpaRepository<FloorPlanEntity, String> {
}

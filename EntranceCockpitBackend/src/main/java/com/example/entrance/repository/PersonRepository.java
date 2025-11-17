package com.example.entrance.repository;

import com.example.entrance.entity.PersonEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PersonRepository extends JpaRepository<PersonEntity, Long> {

    boolean existsByBadgeIdIgnoreCase(String badgeId);

    Optional<PersonEntity> findByBadgeIdIgnoreCase(String badgeId);

    long deleteByBadgeIdIgnoreCase(String badgeId);
}

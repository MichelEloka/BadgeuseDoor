package com.example.entrance.service;

import com.example.entrance.entity.FloorPlanEntity;
import com.example.entrance.repository.FloorPlanRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

@Service
@Transactional
public class FloorPlanService {

    private final FloorPlanRepository repository;
    private final ObjectMapper objectMapper;

    public FloorPlanService(FloorPlanRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Optional<Map<String, Object>> getPlan(String floorId) {
        return repository.findById(floorId)
                .map(FloorPlanEntity::getContent)
                .map(this::readPayload);
    }

    public void savePlan(String floorId, Object payload) {
        FloorPlanEntity entity = repository.findById(floorId).orElseGet(FloorPlanEntity::new);
        entity.setId(floorId);
        entity.setContent(writePayload(payload));
        repository.save(entity);
    }

    private Map<String, Object> readPayload(String content) {
        try {
            return objectMapper.readValue(content, Map.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to deserialize plan", e);
        }
    }

    private String writePayload(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize plan", e);
        }
    }
}

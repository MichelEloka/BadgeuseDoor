package com.example.entrance.service.simulator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Component
public class SimulatorClient {

    private static final Logger log = LoggerFactory.getLogger(SimulatorClient.class);

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public SimulatorClient(
            @Value("${simulator.base-url:http://localhost:9002}") String baseUrl,
            RestTemplateBuilder builder
    ) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.restTemplate = builder
                .setConnectTimeout(Duration.ofSeconds(3))
                .setReadTimeout(Duration.ofSeconds(5))
                .build();
    }

    public void createDevice(String kind, String deviceId, String doorId) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("kind", kind);
        payload.put("device_id", deviceId);
        if (doorId != null && !doorId.isBlank()) {
            payload.put("door_id", doorId);
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<Map> response = restTemplate.postForEntity(baseUrl + "/devices", new HttpEntity<>(payload, headers), Map.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new IllegalStateException("Simulator returned status " + response.getStatusCode());
            }
        } catch (RestClientException ex) {
            log.error("[simulator] create device {} failed: {}", deviceId, ex.getMessage());
            throw new IllegalStateException("Simulator unavailable for device creation", ex);
        }
    }

    public boolean deleteDevice(String deviceId) {
        try {
            restTemplate.exchange(baseUrl + "/devices/" + deviceId, HttpMethod.DELETE, HttpEntity.EMPTY, Void.class);
            return true;
        } catch (RestClientException ex) {
            log.warn("[simulator] delete {} failed: {}", deviceId, ex.getMessage());
            return false;
        }
    }
}

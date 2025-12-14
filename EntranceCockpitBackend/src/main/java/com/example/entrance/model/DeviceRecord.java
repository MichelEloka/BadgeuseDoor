package com.example.entrance.model;

import java.time.Instant;
import java.util.List;

public record DeviceRecord(String id,
                           String type,
                           Instant createdAt,
                           boolean builtin,
                           String location,
                           String doorId,
                           List<String> zones) {
}

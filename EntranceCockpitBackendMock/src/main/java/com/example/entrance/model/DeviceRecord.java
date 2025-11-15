package com.example.entrance.model;

import java.time.Instant;

public record DeviceRecord(String id, String type, Instant createdAt, boolean builtin) {
}

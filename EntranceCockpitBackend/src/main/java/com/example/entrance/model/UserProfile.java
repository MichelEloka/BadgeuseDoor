package com.example.entrance.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record UserProfile(
        String id,
        String firstName,
        String lastName,
        @JsonProperty("badgeID") String badgeId
) {
}

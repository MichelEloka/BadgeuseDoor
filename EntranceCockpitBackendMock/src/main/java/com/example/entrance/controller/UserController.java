package com.example.entrance.controller;

import com.example.entrance.model.UserProfile;
import com.example.entrance.service.UserDirectoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mock/users")
public class UserController {

    private final UserDirectoryService directoryService;

    public UserController(UserDirectoryService directoryService) {
        this.directoryService = directoryService;
    }

    @GetMapping
    public List<UserProfile> listUsers() {
        return directoryService.findAll();
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody Map<String, String> body) {
        String badgeId = body.getOrDefault("badgeId", body.getOrDefault("badgeID", "")).trim();
        String firstName = body.getOrDefault("firstName", "").trim();
        String lastName = body.getOrDefault("lastName", "").trim();
        if (!StringUtils.hasText(badgeId) || !StringUtils.hasText(firstName) || !StringUtils.hasText(lastName)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "badgeId, firstName and lastName are required"));
        }
        if (directoryService.badgeExists(badgeId)) {
            return ResponseEntity.status(409).body(Map.of("status", "error", "message", "badge already registered"));
        }
        UserProfile profile = directoryService.register(firstName, lastName, badgeId);
        return ResponseEntity.ok(profile);
    }

    @DeleteMapping({"/delete/{userId}", "/{userId}"})
    public ResponseEntity<?> deleteUser(@PathVariable("userId") String userId) {
        String target = userId == null ? "" : userId.trim();
        if (!StringUtils.hasText(target)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "User identifier is required"));
        }
        boolean removed = directoryService.deleteById(target);
        if (!removed) {
            return ResponseEntity.status(404).body(Map.of("status", "error", "message", "User not found"));
        }
        return ResponseEntity.noContent().build();
    }
}

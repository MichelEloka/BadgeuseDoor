package com.example.entrance.controller;

import com.example.entrance.model.UserProfile;
import com.example.entrance.service.UserDirectoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
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
        String badgeId = safe(body.get("badgeId"), body.get("badgeID"));
        String firstName = safe(body.get("firstName"));
        String lastName = safe(body.get("lastName"));
        String imageUrl = safe(body.get("imageUrl"), body.get("image_url"));
        if (!StringUtils.hasText(badgeId) || !StringUtils.hasText(firstName) || !StringUtils.hasText(lastName)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "badgeId, firstName and lastName are required"));
        }
        if (directoryService.badgeExists(badgeId)) {
            return ResponseEntity.status(409).body(Map.of("status", "error", "message", "badge already registered"));
        }
        UserProfile profile = directoryService.register(firstName, lastName, badgeId, StringUtils.hasText(imageUrl) ? imageUrl : null);
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

    @PatchMapping("/{userId}/image")
    public ResponseEntity<?> updateImage(@PathVariable("userId") String userId, @RequestBody Map<String, String> body) {
        String target = userId == null ? "" : userId.trim();
        if (!StringUtils.hasText(target)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "User identifier is required"));
        }
        String imageUrl = body.getOrDefault("imageUrl", body.getOrDefault("image_url", "")).trim();
        if (!StringUtils.hasText(imageUrl)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "imageUrl is required"));
        }
        return directoryService.updateImage(target, imageUrl)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("status", "error", "message", "User not found")));
    }

    @DeleteMapping("/{userId}/image")
    public ResponseEntity<?> deleteImage(@PathVariable("userId") String userId) {
        String target = userId == null ? "" : userId.trim();
        if (!StringUtils.hasText(target)) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "User identifier is required"));
        }
        boolean cleared = directoryService.clearImage(target);
        if (!cleared) {
            return ResponseEntity.status(404).body(Map.of("status", "error", "message", "User not found"));
        }
        return ResponseEntity.noContent().build();
    }

    private String safe(String... values) {
        if (values == null) return "";
        for (String v : values) {
            if (v != null) {
                return v.trim();
            }
        }
        return "";
    }
}

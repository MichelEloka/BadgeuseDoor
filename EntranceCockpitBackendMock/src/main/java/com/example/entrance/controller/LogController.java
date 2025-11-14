package com.example.entrance.controller;

import com.example.entrance.model.UserProfile;
import com.example.entrance.service.UserDirectoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mock/logs")
public class LogController {

    private final UserDirectoryService directoryService;

    public LogController(UserDirectoryService directoryService) {
        this.directoryService = directoryService;
    }

    @GetMapping("/{logId}")
    public ResponseEntity<?> details(@PathVariable("logId") String logId) {
        String id = logId == null ? "" : logId.trim();
        if (!StringUtils.hasText(id)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Log identifier is required"));
        }
        List<UserProfile> related = directoryService.sample(2);
        List<Map<String, Object>> users = related.stream()
                .map(user -> {
                    Map<String, Object> map = new java.util.HashMap<>();
                    map.put("id", user.id());
                    map.put("firstName", user.firstName());
                    map.put("lastName", user.lastName());
                    map.put("badgeID", user.badgeId());
                    return map;
                })
                .toList();
        return ResponseEntity.ok(Map.of(
                "id", id,
                "users", users
        ));
    }
}

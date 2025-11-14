package com.example.entrance.service;

import com.example.entrance.model.UserProfile;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class UserDirectoryService {

    private final CopyOnWriteArrayList<UserProfile> users = new CopyOnWriteArrayList<>(
            List.of(
                    new UserProfile("user-001", "Ava", "Turner", "BADGE-001"),
                    new UserProfile("user-002", "Noah", "Reed", "BADGE-002"),
                    new UserProfile("user-003", "Mila", "Scott", "BADGE-003"),
                    new UserProfile("user-004", "Ethan", "Cole", "BADGE-004")
            )
    );

    public List<UserProfile> findAll() {
        return List.copyOf(users);
    }

    public Optional<UserProfile> findById(String id) {
        if (id == null) {
            return Optional.empty();
        }
        return users.stream().filter(u -> u.id().equalsIgnoreCase(id)).findFirst();
    }

    public boolean badgeExists(String badgeId) {
        if (badgeId == null) {
            return false;
        }
        return users.stream().anyMatch(u -> u.badgeId().equalsIgnoreCase(badgeId));
    }

    public UserProfile register(String firstName, String lastName, String badgeId) {
        String identifier = String.format("user-%03d", users.size() + 1);
        UserProfile profile = new UserProfile(identifier, firstName, lastName, badgeId);
        users.add(profile);
        return profile;
    }

    public Optional<UserProfile> findByBadge(String badgeId) {
        if (badgeId == null) {
            return Optional.empty();
        }
        return users.stream().filter(u -> u.badgeId().equalsIgnoreCase(badgeId)).findFirst();
    }

    public boolean deleteById(String userId) {
        if (userId == null) {
            return false;
        }
        return users.removeIf(u -> u.id().equalsIgnoreCase(userId));
    }

    public List<UserProfile> sample(int max) {
        if (users.isEmpty() || max <= 0) {
            return List.of();
        }
        List<UserProfile> copy = new ArrayList<>(users);
        Collections.shuffle(copy);
        return List.copyOf(copy.subList(0, Math.min(max, copy.size())));
    }
}

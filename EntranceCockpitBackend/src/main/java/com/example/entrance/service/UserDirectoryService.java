package com.example.entrance.service;

import com.example.entrance.entity.PersonEntity;
import com.example.entrance.model.UserProfile;
import com.example.entrance.repository.PersonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class UserDirectoryService {

    private final PersonRepository repository;

    public UserDirectoryService(PersonRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<UserProfile> findAll() {
        return repository.findAll().stream().map(this::toProfile).toList();
    }

    @Transactional(readOnly = true)
    public Optional<UserProfile> findById(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        try {
            long identifier = Long.parseLong(id.trim());
            return repository.findById(identifier).map(this::toProfile);
        } catch (NumberFormatException ex) {
            return repository.findByBadgeIdIgnoreCase(id.trim()).map(this::toProfile);
        }
    }

    @Transactional(readOnly = true)
    public boolean badgeExists(String badgeId) {
        return StringUtils.hasText(badgeId) && repository.existsByBadgeIdIgnoreCase(badgeId.trim());
    }

    public UserProfile register(String firstName, String lastName, String badgeId) {
        String normalizedBadge = badgeId == null ? "" : badgeId.trim();
        PersonEntity entity = new PersonEntity();
        entity.setFirstName(firstName);
        entity.setLastName(lastName);
        entity.setEmail(buildEmail(firstName, lastName, normalizedBadge));
        entity.setRole("User");
        entity.setBadgeId(normalizedBadge);
        PersonEntity saved = repository.save(entity);
        return toProfile(saved);
    }

    public boolean deleteById(String userId) {
        if (!StringUtils.hasText(userId)) {
            return false;
        }
        String trimmed = userId.trim();
        try {
            long identifier = Long.parseLong(trimmed);
            if (repository.existsById(identifier)) {
                repository.deleteById(identifier);
                return true;
            }
        } catch (NumberFormatException ignored) {
            long deleted = repository.deleteByBadgeIdIgnoreCase(trimmed);
            return deleted > 0;
        }
        return false;
    }

    @Transactional(readOnly = true)
    public List<UserProfile> sample(int max) {
        if (max <= 0) {
            return List.of();
        }
        List<UserProfile> copy = new ArrayList<>(findAll());
        if (copy.isEmpty()) {
            return List.of();
        }
        Collections.shuffle(copy);
        return List.copyOf(copy.subList(0, Math.min(max, copy.size())));
    }

    private UserProfile toProfile(PersonEntity entity) {
        return new UserProfile(
                entity.getId() == null ? null : entity.getId().toString(),
                entity.getFirstName(),
                entity.getLastName(),
                entity.getBadgeId()
        );
    }

    private String buildEmail(String firstName, String lastName, String badgeId) {
        if (StringUtils.hasText(firstName) && StringUtils.hasText(lastName)) {
            return (firstName + "." + lastName + "@episen.fr").toLowerCase();
        }
        return "user-" + badgeId.toLowerCase() + "@episen.fr";
    }
}

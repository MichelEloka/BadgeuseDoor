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
    private final MediaClient mediaClient;

    public UserDirectoryService(PersonRepository repository, MediaClient mediaClient) {
        this.repository = repository;
        this.mediaClient = mediaClient;
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

    public UserProfile register(String firstName, String lastName, String badgeId, String imageUrl) {
        String normalizedBadge = badgeId == null ? "" : badgeId.trim();
        PersonEntity entity = new PersonEntity();
        entity.setFirstName(firstName);
        entity.setLastName(lastName);
        entity.setEmail(buildEmail(firstName, lastName, normalizedBadge));
        entity.setRole("User");
        entity.setBadgeId(normalizedBadge);
        entity.setImageUrl(imageUrl == null ? null : imageUrl.trim());
        PersonEntity saved = repository.save(entity);
        return toProfile(saved);
    }

    public boolean deleteById(String userId) {
        Optional<PersonEntity> entityOpt = findEntity(userId);
        if (entityOpt.isEmpty()) {
            return false;
        }
        PersonEntity entity = entityOpt.get();
        deleteMediaIfAny(entity);
        repository.delete(entity);
        return true;
    }

    public Optional<UserProfile> updateImage(String userId, String imageUrl) {
        Optional<PersonEntity> found = findEntity(userId);
        if (found.isEmpty()) return Optional.empty();
        PersonEntity entity = found.get();
        entity.setImageUrl(StringUtils.hasText(imageUrl) ? imageUrl.trim() : null);
        PersonEntity saved = repository.save(entity);
        return Optional.of(toProfile(saved));
    }

    public boolean clearImage(String userId) {
        Optional<PersonEntity> found = findEntity(userId);
        if (found.isEmpty()) return false;
        PersonEntity entity = found.get();
        deleteMediaIfAny(entity);
        entity.setImageUrl(null);
        repository.save(entity);
        return true;
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
                entity.getBadgeId(),
                entity.getImageUrl()
        );
    }

    private Optional<PersonEntity> findEntity(String identifier) {
        if (!StringUtils.hasText(identifier)) {
            return Optional.empty();
        }
        String trimmed = identifier.trim();
        try {
            long id = Long.parseLong(trimmed);
            return repository.findById(id);
        } catch (NumberFormatException ignored) {
            return repository.findByBadgeIdIgnoreCase(trimmed);
        }
    }

    private void deleteMediaIfAny(PersonEntity entity) {
        try {
            mediaClient.deleteImageByUrl(entity.getImageUrl());
        } catch (Exception ignored) {
            // on ignore les erreurs de suppression des assets media
        }
    }

    private String buildEmail(String firstName, String lastName, String badgeId) {
        if (StringUtils.hasText(firstName) && StringUtils.hasText(lastName)) {
            return (firstName + "." + lastName + "@episen.fr").toLowerCase();
        }
        return "user-" + badgeId.toLowerCase() + "@episen.fr";
    }
}

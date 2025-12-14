package com.example.entrance.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "people")
public class PersonEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column
    private String role;

    @Column(name = "image_url", length = 2048)
    private String imageUrl;

    @Column(name = "badge_id", nullable = false, unique = true)
    private String badgeId;

    @Column(name = "last_entry")
    private Instant lastEntry;

    public Long getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getBadgeId() {
        return badgeId;
    }

    public void setBadgeId(String badgeId) {
        this.badgeId = badgeId;
    }

    public Instant getLastEntry() {
        return lastEntry;
    }

    public void setLastEntry(Instant lastEntry) {
        this.lastEntry = lastEntry;
    }
}

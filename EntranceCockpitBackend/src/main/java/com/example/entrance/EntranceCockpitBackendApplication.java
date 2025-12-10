package com.example.entrance;

import com.example.entrance.entity.PersonEntity;
import com.example.entrance.repository.PersonRepository;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.util.List;

@SpringBootApplication
public class EntranceCockpitBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(EntranceCockpitBackendApplication.class, args);
    }

    @Bean
    public org.springframework.boot.CommandLineRunner seedDirectory(PersonRepository repository) {
        return args -> {
            if (repository.count() > 0) {
                return;
            }
            List<PersonEntity> initial = List.of(
                    build("Alice", "Martin", "100001"),
                    build("Bob", "Durand", "100002"),
                    build("Charlie", "Petit", "100003"),
                    build("Diane", "Roux", "100004")
            );
            repository.saveAll(initial);
        };
    }

    private PersonEntity build(String firstName, String lastName, String badgeId) {
        PersonEntity person = new PersonEntity();
        person.setFirstName(firstName);
        person.setLastName(lastName);
        person.setBadgeId(badgeId);
        person.setEmail((firstName + "." + lastName + "@example.test").toLowerCase());
        person.setRole("User");
        return person;
    }
}

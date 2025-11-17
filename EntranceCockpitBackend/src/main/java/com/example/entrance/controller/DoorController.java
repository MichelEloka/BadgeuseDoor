package com.example.entrance.controller;

import com.example.entrance.model.DeviceRecord;
import com.example.entrance.service.DeviceRegistryService;
import com.example.entrance.service.DirectoryLookupService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/doors")
public class DoorController {

    private final DirectoryLookupService directoryService;
    private final DeviceRegistryService registryService;

    public DoorController(DirectoryLookupService directoryService, DeviceRegistryService registryService) {
        this.directoryService = directoryService;
        this.registryService = registryService;
    }

    @GetMapping
    public List<String> listDoors() {
        List<String> doors = registryService.findAll().stream()
                .filter(record -> "door".equalsIgnoreCase(record.type()) || "porte".equalsIgnoreCase(record.type()))
                .map(DeviceRecord::id)
                .toList();
        if (doors.isEmpty()) {
            return directoryService.doorIds();
        }
        return doors;
    }
}

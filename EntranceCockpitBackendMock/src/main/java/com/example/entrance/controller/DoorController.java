package com.example.entrance.controller;

import com.example.entrance.service.MockDirectoryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/mock/doors")
public class DoorController {

    private final MockDirectoryService directoryService;

    public DoorController(MockDirectoryService directoryService) {
        this.directoryService = directoryService;
    }

    @GetMapping
    public List<String> listDoors() {
        return directoryService.doorIds();
    }
}

package com.example.entrance.service;

import com.example.entrance.model.MonitoringEvent;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Random;

@Service
public class MockEventGenerator {

    private static final Logger log = LoggerFactory.getLogger(MockEventGenerator.class);

    private final MonitoringHub hub;
    private final MockDirectoryService directoryService;
    private final Random random = new Random();
    private final TaskScheduler scheduler;

    @Value("${mock.events.auto:false}")
    private boolean autoMode;

    @Value("${mock.events.interval:PT3S}")
    private Duration interval;

    public MockEventGenerator(MonitoringHub hub, MockDirectoryService directoryService) {
        this.hub = hub;
        this.directoryService = directoryService;
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("mock-events-");
        scheduler.initialize();
        this.scheduler = scheduler;
    }

    @PostConstruct
    public void startAutoMode() {
        if (autoMode) {
            log.info("Auto mock events enabled (every {})", interval);
            scheduler.scheduleAtFixedRate(this::publishRandomEvent, interval);
        } else {
            log.info("Auto mock events disabled. Use REST endpoint POST /api/mock/events to push data.");
        }
    }

    public void publishRandomEvent() {
        boolean success = random.nextDouble() > 0.2;
        boolean unknown = random.nextDouble() < 0;
        String badgeId = unknown ? directoryService.randomUnknownBadgeId() : directoryService.randomBadgeId();
        MonitoringEvent event = MonitoringEvent.badgeAttempt(
                badgeId,
                directoryService.randomDoorId(),
                success,
                directoryService.randomDeviceId()
        );
        hub.broadcast(event);
    }

    public void publish(MonitoringEvent event) {
        hub.broadcast(event);
    }
}

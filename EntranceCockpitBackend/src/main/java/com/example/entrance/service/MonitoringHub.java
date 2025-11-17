package com.example.entrance.service;

import com.example.entrance.model.MonitoringEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

@Component
public class MonitoringHub {

    private static final Logger log = LoggerFactory.getLogger(MonitoringHub.class);

    private final ObjectMapper objectMapper;
    private final DirectoryLookupService directoryLookupService;
    private final Set<WebSocketSession> sessions = Collections.synchronizedSet(new HashSet<>());

    public MonitoringHub(ObjectMapper objectMapper, DirectoryLookupService directoryLookupService) {
        this.objectMapper = objectMapper;
        this.directoryLookupService = directoryLookupService;
    }

    public void register(WebSocketSession session) {
        sessions.add(session);
        log.info("Client connected (total sessions: {})", sessions.size());
        sendSnapshot(session);
    }

    public void unregister(WebSocketSession session) {
        sessions.remove(session);
        log.info("Client disconnected (total sessions: {})", sessions.size());
    }

    public void broadcast(MonitoringEvent event) {
        broadcastPayload(event);
    }

    public void broadcastPayload(Object payload) {
        synchronized (sessions) {
            sessions.removeIf(session -> !send(payload, session));
        }
    }

    private void sendSnapshot(WebSocketSession session) {
        String badge = directoryLookupService.randomBadgeId();
        String door = directoryLookupService.randomDoorId();
        String device = directoryLookupService.randomDeviceId();
        MonitoringEvent snapshot = MonitoringEvent.badgeAttempt(badge, door, true, device);
        send(snapshot, session);
    }

    private boolean send(Object payload, WebSocketSession session) {
        if (session == null || !session.isOpen()) {
            return false;
        }
        try {
            session.sendMessage(new TextMessage(serialize(payload)));
            return true;
        } catch (IOException e) {
            log.warn("Unable to send payload to {}: {}", session.getId(), e.getMessage());
            return false;
        }
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize event", e);
        }
    }
}

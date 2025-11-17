package com.example.entrance.service;

import com.example.entrance.model.MonitoringEvent;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class EventStreamService {

    private static final Logger log = LoggerFactory.getLogger(EventStreamService.class);

    private final MonitoringHub hub;
    private final DirectoryLookupService directoryService;
    private final ObjectMapper objectMapper;
    private final Random random = new Random();
    private final TaskScheduler scheduler;
    private final AtomicBoolean fallbackStarted = new AtomicBoolean(false);

    @Value("${events.interval:PT3S}")
    private Duration interval;

    @Value("${events.kafka.enabled:true}")
    private boolean kafkaEnabled;

    @Value("${events.kafka.bootstrap-servers:}")
    private String kafkaBootstrapServers;

    @Value("${events.kafka.topic:}")
    private String kafkaTopic;

    @Value("${events.kafka.additional-topic:}")
    private String kafkaAdditionalTopic;

    @Value("${events.kafka.group-id:entrance-cockpit}")
    private String kafkaGroupId;

    @Value("${events.kafka.extra-topics:}")
    private String kafkaExtraTopics;

    private ExecutorService kafkaExecutor;

    public EventStreamService(MonitoringHub hub, DirectoryLookupService directoryService, ObjectMapper objectMapper) {
        this.hub = hub;
        this.directoryService = directoryService;
        this.objectMapper = objectMapper;
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("event-stream-");
        scheduler.initialize();
        this.scheduler = scheduler;
    }

    @PostConstruct
    public void start() {
        if (kafkaEnabled && hasKafkaConfig()) {
            startKafkaConsumer();
        } else {
            log.warn("Kafka disabled or misconfigured. Falling back to internal event generator.");
            startFallbackGenerator();
        }
    }

    @PreDestroy
    public void shutdown() {
        if (kafkaExecutor != null) {
            kafkaExecutor.shutdownNow();
        }
    }

    private boolean hasKafkaConfig() {
        return StringUtils.hasText(kafkaBootstrapServers) && !resolveTopics().isEmpty();
    }

    private void startKafkaConsumer() {
        kafkaExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "event-stream-kafka");
            t.setDaemon(true);
            return t;
        });
        kafkaExecutor.submit(this::consumeKafka);
    }

    private void consumeKafka() {
        List<String> topics = resolveTopics();
        if (topics.isEmpty()) {
            log.warn("Kafka topics not configured. Falling back to internal event generator.");
            startFallbackGenerator();
            return;
        }

        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, kafkaGroupId);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(topics);
            log.info("Kafka consumer started on topics {}", topics);
            while (!Thread.currentThread().isInterrupted()) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
                for (ConsumerRecord<String, String> record : records) {
                    Map<String, String> event = mapKafkaPayload(record.value());
                    if (event != null) {
                        hub.broadcastPayload(event);
                    }
                }
            }
        } catch (Exception ex) {
            log.error("Kafka consumer stopped: {}", ex.getMessage());
            log.warn("Switching to internal generator because Kafka is unavailable.");
            startFallbackGenerator();
        }
    }

    private List<String> resolveTopics() {
        List<String> topics = new ArrayList<>();
        maybeAddTopic(kafkaTopic, topics);
        maybeAddTopic(kafkaAdditionalTopic, topics);
        if (StringUtils.hasText(kafkaExtraTopics)) {
            Arrays.stream(kafkaExtraTopics.split(","))
                    .map(String::trim)
                    .filter(StringUtils::hasText)
                    .forEach(topic -> maybeAddTopic(topic, topics));
        }
        return topics;
    }

    private void maybeAddTopic(String candidate, List<String> topics) {
        if (!StringUtils.hasText(candidate)) {
            return;
        }
        String normalized = candidate.trim();
        if (!topics.contains(normalized)) {
            topics.add(normalized);
        }
    }

    private Map<String, String> mapKafkaPayload(String payload) {
        if (!StringUtils.hasText(payload)) {
            return null;
        }
        try {
            Map<String, Object> data = objectMapper.readValue(payload, new TypeReference<>() {});
            String badgeId = firstNonEmpty(data, "badgeID", "badgeId", "badge_id", "badge");
            String doorId = firstNonEmpty(data, "doorID", "doorId", "door_id", "door");
            String status = firstNonEmpty(data, "status", "action", "result", "state");
            String timestampRaw = firstNonEmpty(data, "timestamp", "ts", "date");
            Instant timestamp = parseTimestamp(timestampRaw);

            Map<String, String> payloadMap = new HashMap<>();
            payloadMap.put("badgeID", badgeId != null ? badgeId : "");
            payloadMap.put("doorID", doorId != null ? doorId : "");
            payloadMap.put("status", status != null ? status : "UNKNOWN");
            payloadMap.put("timestamp", (timestamp != null ? timestamp : Instant.now()).toString());
            return payloadMap;
        } catch (Exception ex) {
            log.warn("Unable to parse Kafka payload '{}': {}", payload, ex.getMessage());
            return null;
        }
    }

    private String firstNonEmpty(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object value = map.get(key);
            String text = asText(value);
            if (StringUtils.hasText(text)) {
                return text;
            }
        }
        return null;
    }

    private Instant parseTimestamp(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private String asText(Object value) {
        return value == null ? null : value.toString();
    }

    private void startFallbackGenerator() {
        if (fallbackStarted.compareAndSet(false, true)) {
            log.info("Fallback generator enabled (interval {}).", interval);
            scheduler.scheduleAtFixedRate(this::publishRandomEvent, interval);
        }
    }

    public void publishRandomEvent() {
        boolean success = random.nextDouble() > 0.2;
        boolean unknown = random.nextDouble() < 0.1;
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

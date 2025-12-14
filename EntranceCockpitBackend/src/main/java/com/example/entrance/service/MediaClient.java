package com.example.entrance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
public class MediaClient {

    private static final Logger log = LoggerFactory.getLogger(MediaClient.class);

    private final RestTemplate restTemplate = new RestTemplate();
    private final String baseUrl;

    public MediaClient(@Value("${media.handler.base-url:http://media-handler:8080}") String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public void deleteImageByUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return;
        }
        try {
            String encoded = URLEncoder.encode(url, StandardCharsets.UTF_8);
            URI target = URI.create(baseUrl + "/media?url=" + encoded);
            RequestEntity<Void> request = new RequestEntity<>(HttpMethod.DELETE, target);
            ResponseEntity<Void> response = restTemplate.exchange(request, Void.class);
            log.debug("Delete media {} -> status {}", url, response.getStatusCode());
        } catch (RestClientException ex) {
            log.warn("Failed to delete media {}: {}", url, ex.getMessage());
        }
    }
}

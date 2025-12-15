package com.example.media.service;

import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.InputStream;
import java.net.URI;
import java.time.Instant;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final MinioClient s3Client;
    private final String bucket;
    private final int presignExpirySeconds;
    private final S3Presigner presigner;

    public MediaService(MinioClient s3Client,
                        @Value("${media.s3.bucket}") String bucket,
                        @Value("${media.presign.expiry-seconds:300}") int presignExpirySeconds,
                        S3Presigner presigner) {
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.presignExpirySeconds = presignExpirySeconds;
        this.presigner = presigner;
    }

    public String uploadImage(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new IllegalArgumentException("Only image uploads are allowed");
        }
        String objectName = buildObjectName(file.getOriginalFilename());
        try (InputStream input = file.getInputStream()) {
            s3Client.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectName)
                            .contentType(contentType)
                            .stream(input, file.getSize(), -1)
                            .build()
            );
        }
        log.info("Stored object {} in bucket {}", objectName, bucket);
        // Return a presigned GET URL so the object can remain private.
        GetObjectRequest getRequest = GetObjectRequest.builder()
                .bucket(bucket)
                .key(objectName)
                .build();
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(presignExpirySeconds))
                .getObjectRequest(getRequest)
                .build();
        String presignedUrl = presigner.presignGetObject(presignRequest).url().toString();
        log.info("Presigned media URL generated for {}: {}", objectName, presignedUrl);
        return presignedUrl;
    }

    public boolean deleteByUrl(String url) throws Exception {
        String object = extractObjectName(url);
        if (!StringUtils.hasText(object)) {
            throw new IllegalArgumentException("Unable to extract object name from URL");
        }
        return deleteObject(object);
    }

    public boolean deleteObject(String objectName) throws Exception {
        if (!StringUtils.hasText(objectName)) {
            throw new IllegalArgumentException("objectName is required");
        }
        s3Client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectName).build());
        log.info("Removed object {} from bucket {}", objectName, bucket);
        return true;
    }

    private String extractObjectName(String url) {
        if (!StringUtils.hasText(url)) return null;
        try {
            URI uri = URI.create(url.trim());
            String path = uri.getPath(); // e.g. /bucket/object
            if (!StringUtils.hasText(path)) return null;
            String normalized = path.startsWith("/") ? path.substring(1) : path;
            if (normalized.startsWith(bucket + "/")) {
                return normalized.substring((bucket + "/").length());
            }
            // If only object name is provided
            if (!normalized.contains("/")) {
                return normalized;
            }
            return normalized;
        } catch (Exception e) {
            return null;
        }
    }

    private String buildObjectName(String original) {
        String clean = StringUtils.hasText(original) ? original : "upload";
        String ext = "";
        int dot = clean.lastIndexOf('.');
        if (dot >= 0 && dot < clean.length() - 1) {
            ext = clean.substring(dot);
        }
        return "img-" + Instant.now().toEpochMilli() + "-" + UUID.randomUUID() + ext;
    }
}

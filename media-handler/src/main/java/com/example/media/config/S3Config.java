package com.example.media.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.credentials.Credentials;
import io.minio.credentials.Provider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Configuration
public class S3Config {

    private static final Logger log = LoggerFactory.getLogger(S3Config.class);

    @Value("${media.s3.endpoint}")
    private String endpoint;

    @Value("${media.s3.access-key}")
    private String accessKey;

    @Value("${media.s3.secret-key}")
    private String secretKey;

    @Value("${media.s3.bucket}")
    private String bucket;

    @Value("${media.s3.region:us-east-1}")
    private String region;

    @Value("${media.s3.session-token:}")
    private String sessionToken;

    @Bean
    public MinioClient s3Client() throws Exception {
        var builder = MinioClient.builder()
                .endpoint(endpoint)
                .region(region);

        if (sessionToken != null && !sessionToken.isBlank()) {
            Provider provider = () -> new Credentials(accessKey, secretKey, sessionToken, null);
            builder.credentialsProvider(provider);
        } else {
            builder.credentials(accessKey, secretKey);
        }

        return builder.build();
    }

    @Bean
    public S3Presigner s3Presigner() {
        AwsCredentialsProvider credentialsProvider;
        if (sessionToken != null && !sessionToken.isBlank()) {
            credentialsProvider = StaticCredentialsProvider.create(
                    AwsSessionCredentials.create(accessKey, secretKey, sessionToken)
            );
        } else {
            credentialsProvider = StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(accessKey, secretKey)
            );
        }

        S3Presigner.Builder builder = S3Presigner.builder()
                .region(Region.of(region))
                .credentialsProvider(credentialsProvider)
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .build());

        if (endpoint != null && !endpoint.isBlank()) {
            builder.endpointOverride(java.net.URI.create(endpoint));
        }

        return builder.build();
    }
}

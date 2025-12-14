package com.example.media.controller;

import com.example.media.service.MediaService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/media")
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.DELETE, RequestMethod.OPTIONS})
public class MediaController {

    private static final Logger log = LoggerFactory.getLogger(MediaController.class);

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<?> upload(@RequestPart("file") MultipartFile file) {
        try {
            String url = mediaService.uploadImage(file);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalArgumentException ex) {
            log.warn("Upload refused: {}", ex.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            log.error("Upload failed", ex);
            return ResponseEntity.internalServerError().body(Map.of("error", "upload failed: " + ex.getMessage()));
        }
    }

    @DeleteMapping
    public ResponseEntity<?> delete(@RequestParam(value = "url", required = false) String url,
                                    @RequestParam(value = "object", required = false) String object) {
        try {
            if (url != null && !url.isBlank()) {
                mediaService.deleteByUrl(url);
                return ResponseEntity.noContent().build();
            }
            if (object != null && !object.isBlank()) {
                mediaService.deleteObject(object.trim());
                return ResponseEntity.noContent().build();
            }
            return ResponseEntity.badRequest().body(Map.of("error", "Provide either 'url' or 'object'"));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of("error", "delete failed"));
        }
    }
}

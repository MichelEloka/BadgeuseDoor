package com.example.media.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Ensures CORS headers are present even on error responses.
 */
@Component
@Order(0)
public class CorsResponseFilter extends OncePerRequestFilter {

    @Value("${media.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Set<String> allowed = new HashSet<>(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList());

        String requestOrigin = request.getHeader("Origin");
        String allowOrigin;
        if (allowed.isEmpty() || allowed.contains("*")) {
            allowOrigin = "*";
        } else if (StringUtils.hasText(requestOrigin) && allowed.contains(requestOrigin)) {
            allowOrigin = requestOrigin;
        } else {
            // Not allowed: just return 403 without CORS headers.
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            return;
        }

        response.setHeader("Access-Control-Allow-Origin", allowOrigin);
        response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Origin,Accept");
        response.setHeader("Access-Control-Max-Age", "3600");

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_OK);
            return;
        }

        filterChain.doFilter(request, response);
    }
}

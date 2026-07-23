package com.bizagent.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** web(:3000)이 브라우저에서 api-core(:8080)를 직접 호출하므로 CORS 허용이 필요하다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${web.base-url}")
    private String webBaseUrl;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(webBaseUrl)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
    }
}

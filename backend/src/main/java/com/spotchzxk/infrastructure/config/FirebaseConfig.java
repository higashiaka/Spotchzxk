package com.spotchzxk.infrastructure.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@Configuration
@Slf4j
public class FirebaseConfig {

    @Value("${app.firebase.service-account-path}")
    private String serviceAccountPath;

    @PostConstruct
    public void init() throws IOException {
        if (FirebaseApp.getApps().isEmpty()) {
            File file = new File(serviceAccountPath);
            if (!file.exists()) {
                log.warn("Firebase service account not found at '{}'; Firebase disabled.", serviceAccountPath);
                return;
            }
            FirebaseOptions options;
            try (FileInputStream serviceAccount = new FileInputStream(file)) {
                options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                        .build();
            }
            FirebaseApp.initializeApp(options);
        }
    }
}



package com.spotchzxk.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "device_mappings")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeviceMapping {

    @Id
    @Column(length = 128)
    private String fingerprint;

    @Column(nullable = false, length = 128)
    private String uid;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}

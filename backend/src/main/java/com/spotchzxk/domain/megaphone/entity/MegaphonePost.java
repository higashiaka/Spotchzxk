package com.spotchzxk.domain.megaphone.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "megaphone_posts")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class MegaphonePost {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 128)
    private String userId;

    @Column(nullable = false, length = 50)
    private String channelId;

    @Column(nullable = false, length = 100)
    private String streamerName;

    @Column(length = 50)
    private String message;

    @Column(nullable = false, length = 200)
    private String liveUrl;

    @Column
    private LocalDateTime liveSessionStartedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}



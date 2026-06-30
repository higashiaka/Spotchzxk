package com.spotchzxk.infrastructure.discord;

import com.spotchzxk.domain.feedback.entity.FeedbackSubmission;
import com.spotchzxk.domain.feedback.repository.FeedbackSubmissionRepository;
import com.spotchzxk.domain.feedback.entity.FeedbackReply;
import com.spotchzxk.domain.feedback.repository.FeedbackReplyRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.entities.Message;
import net.dv8tion.jda.api.entities.channel.concrete.TextChannel;
import net.dv8tion.jda.api.events.message.MessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.requests.GatewayIntent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.EnumSet;

@Slf4j
@Component
@RequiredArgsConstructor
public class DiscordFeedbackBot extends ListenerAdapter {

    private static final int MAX_REPLY_CONTENT_LENGTH = 3000;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final FeedbackSubmissionRepository feedbackRepository;
    private final FeedbackReplyRepository feedbackReplyRepository;
    private final TransactionTemplate transactionTemplate;

    @Value("${app.feedback.discord-bot-token:}")
    private String botToken;

    @Value("${app.feedback.discord-channel-id:}")
    private String channelId;

    private volatile JDA jda;

    @PostConstruct
    public void start() {
        if (botToken == null || botToken.isBlank() || channelId == null || channelId.isBlank()) {
            log.info("Discord feedback bot is disabled because token or channel ID is not configured");
            return;
        }
        try {
            jda = JDABuilder.createLight(botToken,
                            EnumSet.of(GatewayIntent.GUILD_MESSAGES, GatewayIntent.MESSAGE_CONTENT))
                    .addEventListeners(this)
                    .build();
            log.info("Discord feedback bot is starting");
        } catch (Exception e) {
            log.error("Failed to start Discord feedback bot", e);
        }
    }

    @PreDestroy
    public void stop() {
        if (jda != null) jda.shutdown();
    }

    public boolean isConfigured() {
        return jda != null;
    }

    public void sendSubmission(FeedbackSubmission feedback, String message) {
        JDA activeJda = jda;
        if (activeJda == null) return;
        TextChannel channel = activeJda.getTextChannelById(channelId);
        if (channel == null) {
            log.warn("Discord feedback channel {} is not available to the bot", channelId);
            return;
        }
        channel.sendMessage(message).queue(
                sent -> transactionTemplate.executeWithoutResult(status ->
                        feedbackRepository.findById(feedback.getId()).ifPresent(saved -> {
                            saved.attachDiscordMessage(sent.getId());
                            feedbackRepository.save(saved);
                        })),
                error -> log.warn("Failed to send feedback {} to Discord", feedback.getId(), error)
        );
    }

    @Override
    public void onMessageReceived(MessageReceivedEvent event) {
        if (event.getAuthor().isBot() || !event.isFromGuild()) return;
        if (!event.getChannel().getId().equals(channelId)) return;

        Message referenced = event.getMessage().getReferencedMessage();
        if (referenced == null) return;

        String answer = event.getMessage().getContentDisplay().trim();
        if (answer.isBlank()) return;
        if (feedbackReplyRepository.existsByDiscordMessageId(event.getMessageId())) return;

        Boolean saved = transactionTemplate.execute(status ->
                feedbackRepository.findByDiscordMessageId(referenced.getId())
                        .map(feedback -> {
                            String content = answer.length() > MAX_REPLY_CONTENT_LENGTH
                                    ? answer.substring(0, MAX_REPLY_CONTENT_LENGTH)
                                    : answer;
                            feedback.markAnswered();
                            feedbackRepository.save(feedback);
                            feedbackReplyRepository.save(FeedbackReply.builder()
                                    .feedbackId(feedback.getId())
                                    .content(content)
                                    .discordMessageId(event.getMessageId())
                                    .createdAt(LocalDateTime.now(KST))
                                    .build());
                            return true;
                        })
                        .orElse(false));

        if (Boolean.TRUE.equals(saved)) {
            event.getMessage().addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("✅")).queue();
        }
    }
}

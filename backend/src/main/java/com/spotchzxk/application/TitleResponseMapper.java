package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.Title;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.Map;

@Component
public class TitleResponseMapper {

    public Map<String, Object> toResponse(Title title) {
        return Map.of(
                "id", title.getId(),
                "label", label(title.getTitleType()),
                "description", description(title),
                "tone", tone(title.getTitleType()),
                "awardedAt", title.getGrantedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String label(String type) {
        return switch (type) {
            case "BETA_SEASON" -> "베타 개척자";
            case "BETA_CHALLENGER" -> "베타 챌린저";
            case "BETA_GRANDMASTER" -> "베타 그랜드마스터";
            case "BETA_MASTER" -> "베타 마스터";
            case "BETA_DIAMOND" -> "베타 다이아몬드";
            case "BETA_EMERALD" -> "베타 에메랄드";
            case "BETA_PLATINUM" -> "베타 플래티넘";
            case "BETA_GOLD" -> "베타 골드";
            case "BETA_SILVER" -> "베타 실버";
            case "BETA_BRONZE" -> "베타 브론즈";
            case "BETA_IRON" -> "베타 아이언";
            case "BETA_REALIZED_TOP" -> "베타 수익왕";
            case "BETA_DIVIDEND_TOP" -> "베타 배당왕";
            case "BETA_FAN_TOP" -> "베타 대표 팬";
            case "CHEER_1" -> "후원 팬";
            case "CHEER_2" -> "열성 팬";
            case "CHEER_3" -> "대표 팬";
            default -> type;
        };
    }

    private String description(Title title) {
        if (title.getStockId() != null && title.getTitleType().startsWith("CHEER_")) {
            return "이 스트리머 종목의 팬 랭킹 칭호";
        }
        if ("BETA_TIER".equals(title.getTitleType())) {
            return "베타 시즌 종료 시점의 최종 티어 기준 칭호";
        }
        return "정식 전환 및 시즌 보상 칭호";
    }

    private String tone(String type) {
        return switch (type) {
            case "BETA_SEASON", "BETA_CHALLENGER", "BETA_GRANDMASTER", "BETA_MASTER", "CHEER_3" -> "gold";
            case "BETA_DIAMOND", "BETA_DIVIDEND_TOP" -> "blue";
            case "BETA_EMERALD", "BETA_PLATINUM", "BETA_REALIZED_TOP", "CHEER_2" -> "green";
            case "BETA_GOLD" -> "gold";
            case "BETA_FAN_TOP", "CHEER_1" -> "red";
            default -> "gray";
        };
    }
}

package com.spotchzxk.application;

import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.entity.Title;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class TitleResponseMapper {

    private final StockRepository stockRepository;

    public Map<String, Object> toResponse(Title title) {
        return Map.of(
                "id", title.getId(),
                "label", label(title),
                "description", description(title),
                "tone", tone(title.getTitleType()),
                "awardedAt", title.getGrantedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String label(Title title) {
        String type = title.getTitleType();
        if (title.getStockId() != null && (type.equals("CHEER_VVIP") || type.equals("CHEER_VIP"))) {
            String streamerName = stockRepository.findById(title.getStockId())
                    .map(s -> s.getStreamerName())
                    .orElse("알 수 없는 스트리머");
            return streamerName + "의 " + (type.equals("CHEER_VVIP") ? "VVIP" : "VIP");
        }
        return switch (type) {
            case "BETA_SEASON"      -> "베타 개척자";
            case "BETA_CHALLENGER"  -> "베타 챌린저";
            case "BETA_GRANDMASTER" -> "베타 그랜드마스터";
            case "BETA_MASTER"      -> "베타 마스터";
            case "BETA_DIAMOND"     -> "베타 다이아몬드";
            case "BETA_EMERALD"     -> "베타 에메랄드";
            case "BETA_PLATINUM"    -> "베타 플래티넘";
            case "BETA_GOLD"        -> "베타 골드";
            case "BETA_SILVER"      -> "베타 실버";
            case "BETA_BRONZE"      -> "베타 브론즈";
            case "BETA_IRON"        -> "베타 아이언";
            case "BETA_REALIZED_TOP" -> "베타 수익왕";
            case "BETA_DIVIDEND_TOP" -> "베타 배당왕";
            case "BETA_FAN_TOP"     -> "베타 대표 팬";
            case "CHEER_1"          -> "후원 팬";
            case "CHEER_2"          -> "열성 팬";
            case "CHEER_3"          -> "대표 팬";
            default -> type;
        };
    }

    private String description(Title title) {
        String type = title.getTitleType();
        if (title.getStockId() != null && (type.equals("CHEER_VVIP") || type.equals("CHEER_VIP"))) {
            return "베타 시즌 종목별 후원 " + (type.equals("CHEER_VVIP") ? "1위" : "2~10위") + " 칭호";
        }
        if (title.getStockId() != null && type.startsWith("CHEER_")) {
            return "이 스트리머 종목의 팬 랭킹 칭호";
        }
        return switch (type) {
            case "BETA_SEASON"       -> "베타 시즌에 참여한 개척자 칭호";
            case "BETA_CHALLENGER"   -> "베타 시즌 종료 시점 상위 1% 달성 칭호";
            case "BETA_GRANDMASTER"  -> "베타 시즌 종료 시점 상위 3% 달성 칭호";
            case "BETA_MASTER"       -> "베타 시즌 종료 시점 상위 6% 달성 칭호";
            case "BETA_DIAMOND"      -> "베타 시즌 종료 시점 상위 12% 달성 칭호";
            case "BETA_EMERALD"      -> "베타 시즌 종료 시점 상위 25% 달성 칭호";
            case "BETA_PLATINUM"     -> "베타 시즌 종료 시점 상위 45% 달성 칭호";
            case "BETA_GOLD"         -> "베타 시즌 종료 시점 상위 65% 달성 칭호";
            case "BETA_SILVER"       -> "베타 시즌 종료 시점 상위 82% 달성 칭호";
            case "BETA_BRONZE"       -> "베타 시즌 종료 시점 상위 93% 달성 칭호";
            case "BETA_IRON"         -> "베타 시즌 종료 시점 아이언 티어 칭호";
            case "BETA_REALIZED_TOP" -> "베타 시즌 실현 손익 상위 랭커 칭호";
            case "BETA_DIVIDEND_TOP" -> "베타 시즌 배당 수익 상위 랭커 칭호";
            case "BETA_FAN_TOP"      -> "베타 시즌 종목별 대표 팬 칭호";
            default -> "정식 전환 및 시즌 보상 칭호";
        };
    }

    private String tone(String type) {
        return switch (type) {
            case "BETA_SEASON", "BETA_CHALLENGER", "BETA_GRANDMASTER", "BETA_MASTER",
                 "BETA_GOLD", "CHEER_3", "CHEER_VVIP" -> "gold";
            case "BETA_DIAMOND", "BETA_DIVIDEND_TOP"   -> "blue";
            case "BETA_EMERALD", "BETA_PLATINUM", "BETA_REALIZED_TOP", "CHEER_2", "CHEER_VIP" -> "green";
            case "BETA_FAN_TOP", "CHEER_1"             -> "red";
            default -> "gray";
        };
    }
}

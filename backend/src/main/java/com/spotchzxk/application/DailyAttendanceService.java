package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.DailyAttendanceReward;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.DailyAttendanceRewardRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

@Service
@RequiredArgsConstructor
public class DailyAttendanceService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final BigDecimal BASE_REWARD = new BigDecimal("500000");
    private static final BigDecimal MID_REWARD = new BigDecimal("1500000");
    private static final BigDecimal SEVEN_DAY_REWARD = new BigDecimal("5000000");

    private final DailyAttendanceRewardRepository rewardRepository;
    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    public Map<String, Object> getStatus(String uid) {
        return transactionTemplate.execute(status -> buildStatus(uid, today(), null));
    }

    public Map<String, Object> claim(String uid) {
        AtomicReference<Map<String, Object>> result = new AtomicReference<>();
        tradeEngine.runWithUserLock(uid, () -> result.set(transactionTemplate.execute(status -> claimLocked(uid))));
        return result.get();
    }

    private Map<String, Object> claimLocked(String uid) {
        LocalDate today = today();
        Optional<DailyAttendanceReward> todayReward = rewardRepository.findByUserIdAndAttendanceDate(uid, today);
        if (todayReward.isPresent()) {
            return buildStatus(uid, today, todayReward.get());
        }

        User user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("User account was not found. Please sign in again."));

        DailyAttendanceReward latest = rewardRepository.findTopByUserIdOrderByAttendanceDateDesc(uid).orElse(null);
        long streakDay = nextStreakDay(latest, today);
        AttendanceReward rewardPlan = rewardFor(streakDay);

        DailyAttendanceReward reward = DailyAttendanceReward.builder()
                .userId(uid)
                .attendanceDate(today)
                .streakDay(streakDay)
                .rewardType(rewardPlan.rewardType())
                .itemType(rewardPlan.itemType())
                .itemName(rewardPlan.itemName())
                .itemQuantity(rewardPlan.itemQuantity())
                .rewardAmount(rewardPlan.rewardAmount())
                .claimedAt(LocalDateTime.now(KST))
                .build();

        try {
            rewardRepository.saveAndFlush(reward);
            grantReward(uid, rewardPlan);
            tradeEngine.evictUserCache(uid);
        } catch (DataIntegrityViolationException e) {
            reward = rewardRepository.findByUserIdAndAttendanceDate(uid, today)
                    .orElseThrow(() -> e);
        }

        User updated = userRepository.findById(uid).orElse(user);
        return statusMap(true, streakDay, rewardPlan, updated, true);
    }

    private Map<String, Object> buildStatus(String uid, LocalDate today, DailyAttendanceReward todayReward) {
        DailyAttendanceReward latest = rewardRepository.findTopByUserIdOrderByAttendanceDateDesc(uid).orElse(null);
        boolean claimedToday = todayReward != null
                || (latest != null && today.equals(latest.getAttendanceDate()));
        long currentStreak = latest == null ? 0 : currentStreakDay(latest, today);
        long claimStreak = claimedToday ? currentStreak : nextStreakDay(latest, today);
        AttendanceReward rewardPlan = claimedToday && todayReward != null
                ? rewardFromEntity(todayReward)
                : rewardFor(claimStreak);
        User user = userRepository.findById(uid).orElse(null);
        return statusMap(claimedToday, currentStreak, rewardPlan, user, false);
    }

    private Map<String, Object> statusMap(
            boolean claimedToday,
            long streakDay,
            AttendanceReward rewardPlan,
            User user,
            boolean claimed
    ) {
        Map<String, Object> response = new HashMap<>();
        response.put("claimed", claimed);
        response.put("claimedToday", claimedToday);
        response.put("streakDay", streakDay);
        response.put("rewardType", rewardPlan.rewardType());
        response.put("itemType", rewardPlan.itemType() == null ? "" : rewardPlan.itemType());
        response.put("itemName", rewardPlan.itemName() == null ? "" : rewardPlan.itemName());
        response.put("itemQuantity", rewardPlan.itemQuantity());
        response.put("rewardAmount", rewardPlan.rewardAmount());
        response.put("balance", user == null ? BigDecimal.ZERO : user.getCoinBalance());
        response.put("nicknameChangeTickets", user == null ? 0 : user.getNicknameChangeTickets());
        response.put("stockAddTickets", user == null ? 0 : user.getStockAddTickets());
        response.put("megaphoneTickets", user == null ? 0 : user.getMegaphoneTickets());
        response.put("nextMilestoneDay", nextMilestoneDay(streakDay));
        response.put("nextMilestoneReward", rewardFor(nextMilestoneDay(streakDay)).toMap());
        return response;
    }

    private LocalDate today() {
        return LocalDate.now(KST);
    }

    private long currentStreakDay(DailyAttendanceReward latest, LocalDate today) {
        if (today.equals(latest.getAttendanceDate()) || today.minusDays(1).equals(latest.getAttendanceDate())) {
            return latest.getStreakDay();
        }
        return 0;
    }

    private long nextStreakDay(DailyAttendanceReward latest, LocalDate today) {
        if (latest == null) return 1;
        if (today.equals(latest.getAttendanceDate())) return latest.getStreakDay();
        if (today.minusDays(1).equals(latest.getAttendanceDate())) return latest.getStreakDay() + 1;
        return 1;
    }

    private AttendanceReward rewardFor(long streakDay) {
        long cycleDay = ((Math.max(streakDay, 1) - 1) % 14) + 1;
        return switch ((int) cycleDay) {
            case 2, 5, 10 -> AttendanceReward.item("megaphone-ticket", "Megaphone Ticket", 1);
            case 3 -> AttendanceReward.item("nickname-change-ticket", "Nickname Change Ticket", 1);
            case 7 -> AttendanceReward.cash(SEVEN_DAY_REWARD);
            case 14 -> AttendanceReward.item("stock-add-ticket", "Stock Add Ticket", 1);
            case 6, 11, 13 -> AttendanceReward.cash(MID_REWARD);
            default -> AttendanceReward.cash(BASE_REWARD);
        };
    }

    private AttendanceReward rewardFromEntity(DailyAttendanceReward reward) {
        if ("item".equals(reward.getRewardType())) {
            return AttendanceReward.item(reward.getItemType(), reward.getItemName(), reward.getItemQuantity());
        }
        return AttendanceReward.cash(reward.getRewardAmount());
    }

    private void grantReward(String uid, AttendanceReward reward) {
        if ("cash".equals(reward.rewardType())) {
            userRepository.addToBalance(uid, reward.rewardAmount());
            return;
        }
        int updated = switch (reward.itemType()) {
            case "megaphone-ticket" -> userRepository.addMegaphoneTicket(uid);
            case "nickname-change-ticket" -> userRepository.addNicknameTicket(uid);
            case "stock-add-ticket" -> userRepository.addStockAddTicket(uid);
            default -> 0;
        };
        if (updated != 1) {
            throw new IllegalStateException("Reward could not be granted. Please try again.");
        }
    }

    private long nextMilestoneDay(long streakDay) {
        long nextThree = ((streakDay / 3) + 1) * 3;
        long nextSeven = ((streakDay / 7) + 1) * 7;
        return Math.min(nextThree, nextSeven);
    }

    private record AttendanceReward(
            String rewardType,
            BigDecimal rewardAmount,
            String itemType,
            String itemName,
            long itemQuantity
    ) {
        static AttendanceReward cash(BigDecimal amount) {
            return new AttendanceReward("cash", amount, null, null, 0);
        }

        static AttendanceReward item(String itemType, String itemName, long quantity) {
            return new AttendanceReward("item", BigDecimal.ZERO, itemType, itemName, quantity);
        }

        Map<String, Object> toMap() {
            return Map.of(
                    "rewardType", rewardType,
                    "rewardAmount", rewardAmount,
                    "itemType", itemType == null ? "" : itemType,
                    "itemName", itemName == null ? "" : itemName,
                    "itemQuantity", itemQuantity
            );
        }
    }
}

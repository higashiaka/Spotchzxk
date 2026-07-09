package com.spotchzxk.domain.trading.repository;

import com.spotchzxk.domain.trading.entity.LiquidityEvent;
import com.spotchzxk.domain.trading.entity.LiquidityEventPhase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface LiquidityEventRepository extends JpaRepository<LiquidityEvent, String> {

    boolean existsByChannelIdAndPhaseIn(String channelId, Collection<LiquidityEventPhase> phases);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM LiquidityEvent e WHERE e.phase IN :phases ORDER BY e.startedAt ASC")
    List<LiquidityEvent> findActiveForUpdate(@Param("phases") Collection<LiquidityEventPhase> phases);

    long countByChannelIdAndStartedAtGreaterThanEqual(String channelId, LocalDateTime startedAt);
}

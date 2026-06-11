package com.spotchzxk.repository;

import com.spotchzxk.entity.DividendLog;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DividendLogRepository extends JpaRepository<DividendLog, Long> {

    @EntityGraph(attributePaths = "stock")
    List<DividendLog> findTop30ByOrderByCreatedAtDesc();
}

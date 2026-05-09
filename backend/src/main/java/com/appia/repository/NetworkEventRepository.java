package com.appia.repository;

import com.appia.model.NetworkEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * Appia — Network Event Repository
 * Supports ETSI ZSM audit queries and NIS2/DORA compliance reporting.
 */
@Repository
public interface NetworkEventRepository extends JpaRepository<NetworkEvent, Long> {

    // ── Recent events ──────────────────────────────────────────────────────────

    List<NetworkEvent> findTop50ByOrderByDetectedAtDesc();

    List<NetworkEvent> findByStatusOrderByDetectedAtDesc(NetworkEvent.EventStatus status);

    List<NetworkEvent> findByAffectedNodeIdOrderByDetectedAtDesc(String nodeId);

    List<NetworkEvent> findByEventTypeOrderByDetectedAtDesc(NetworkEvent.EventType type);

    List<NetworkEvent> findBySeverityOrderByDetectedAtDesc(NetworkEvent.Severity severity);

    // ── Analytics ─────────────────────────────────────────────────────────────

    @Query("SELECT COUNT(e) FROM NetworkEvent e WHERE e.eventType = :type AND e.detectedAt > :since")
    long countByTypeAfter(@Param("type") NetworkEvent.EventType type,
                          @Param("since") Instant since);

    @Query("SELECT COUNT(e) FROM NetworkEvent e WHERE e.status = 'RESOLVED' AND e.responseLatencyMs IS NOT NULL")
    long countResolved();

    @Query("SELECT AVG(e.responseLatencyMs) FROM NetworkEvent e WHERE e.status = 'RESOLVED' AND e.responseLatencyMs IS NOT NULL")
    Double avgResponseLatencyMs();

    @Query("SELECT COUNT(e) FROM NetworkEvent e WHERE e.severity IN ('HIGH','CRITICAL') AND e.detectedAt > :since")
    long countCriticalSince(@Param("since") Instant since);

    // ── ETSI ZSM: open incidents ───────────────────────────────────────────────
    @Query("SELECT e FROM NetworkEvent e WHERE e.status IN ('DETECTED','RESPONDING') ORDER BY e.severity DESC, e.detectedAt ASC")
    List<NetworkEvent> findOpenIncidents();
}

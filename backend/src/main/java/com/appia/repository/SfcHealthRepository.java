package com.appia.repository;

import com.appia.model.SfcHealthRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Appia — SFC Health Repository (Phase 8)
 * Supports 6G KPI queries: MTTR, reliability, availability.
 */
@Repository
public interface SfcHealthRepository extends JpaRepository<SfcHealthRecord, Long> {

    List<SfcHealthRecord> findTop10BySfcIdOrderByCheckedAtDesc(String sfcId);

    Optional<SfcHealthRecord> findTopBySfcIdOrderByCheckedAtDesc(String sfcId);

    List<SfcHealthRecord> findByHealthStatusOrderByCheckedAtDesc(SfcHealthRecord.HealthStatus status);

    // ── 6G KPI: Availability (% of checks that were healthy) ─────────────────
    @Query("SELECT COUNT(h) FROM SfcHealthRecord h WHERE h.sfcId = :sfcId AND h.checkedAt > :since")
    long countChecksSince(@Param("sfcId") String sfcId, @Param("since") Instant since);

    @Query("SELECT COUNT(h) FROM SfcHealthRecord h WHERE h.sfcId = :sfcId AND h.available = true AND h.checkedAt > :since")
    long countAvailableChecksSince(@Param("sfcId") String sfcId, @Param("since") Instant since);

    // ── 6G KPI: Average latency ───────────────────────────────────────────────
    @Query("SELECT AVG(h.measuredLatencyMs) FROM SfcHealthRecord h WHERE h.sfcId = :sfcId AND h.checkedAt > :since")
    Double avgLatencySince(@Param("sfcId") String sfcId, @Param("since") Instant since);

    // ── 6G KPI: MTTR (avg heal latency in ms) ─────────────────────────────────
    @Query("SELECT AVG(h.healLatencyMs) FROM SfcHealthRecord h WHERE h.healTriggered = true AND h.healLatencyMs IS NOT NULL")
    Double avgMttrMs();

    // ── Count heal events ──────────────────────────────────────────────────────
    @Query("SELECT COUNT(h) FROM SfcHealthRecord h WHERE h.healTriggered = true AND h.checkedAt > :since")
    long countHealsAfter(@Param("since") Instant since);

    // ── All latest records (one per SFC for dashboard) ────────────────────────
    @Query("SELECT h FROM SfcHealthRecord h WHERE h.checkedAt = " +
           "(SELECT MAX(h2.checkedAt) FROM SfcHealthRecord h2 WHERE h2.sfcId = h.sfcId)")
    List<SfcHealthRecord> findLatestPerSfc();

    // ── SLA breach rate ────────────────────────────────────────────────────────
    @Query("SELECT COUNT(h) FROM SfcHealthRecord h WHERE h.slaBreached = true AND h.checkedAt > :since")
    long countSlaBreachesSince(@Param("since") Instant since);
}

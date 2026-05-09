package com.appia.repository;

import com.appia.model.NetworkIntent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Appia — Network Intent Repository (Phase 7: Intent-Based Networking)
 */
@Repository
public interface NetworkIntentRepository extends JpaRepository<NetworkIntent, Long> {

    List<NetworkIntent> findByStatusOrderByCreatedAtDesc(NetworkIntent.IntentStatus status);

    List<NetworkIntent> findAllByOrderByCreatedAtDesc();

    @Query("SELECT i FROM NetworkIntent i WHERE i.status IN ('ACTIVE','VIOLATED') ORDER BY i.createdAt DESC")
    List<NetworkIntent> findEnforceableIntents();

    @Query("SELECT COUNT(i) FROM NetworkIntent i WHERE i.status = 'VIOLATED'")
    long countViolated();

    @Query("SELECT AVG(i.complianceScore) FROM NetworkIntent i WHERE i.status != 'PAUSED'")
    Double avgComplianceScore();
}

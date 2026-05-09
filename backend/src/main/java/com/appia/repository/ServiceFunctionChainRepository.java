package com.appia.repository;

import com.appia.model.ServiceFunctionChain;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ServiceFunctionChainRepository extends JpaRepository<ServiceFunctionChain, Long> {

    List<ServiceFunctionChain> findByPriority(ServiceFunctionChain.Priority priority);

    List<ServiceFunctionChain> findByStatus(ServiceFunctionChain.SfcStatus status);

    List<ServiceFunctionChain> findByAssignedNodeNodeId(String nodeId);

    @Query("SELECT s FROM ServiceFunctionChain s WHERE s.currentLatencyMs > s.maxLatencyMs")
    List<ServiceFunctionChain> findSlaViolators();

    @Query("SELECT s FROM ServiceFunctionChain s WHERE s.priority = 'CRITICAL' AND s.status != 'RUNNING'")
    List<ServiceFunctionChain> findCriticalNotRunning();

    java.util.Optional<ServiceFunctionChain> findBySfcId(String sfcId);
}

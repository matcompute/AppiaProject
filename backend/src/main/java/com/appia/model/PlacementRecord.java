package com.appia.model;

import javax.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * Appia — Placement Record Entity
 * Audit log of every placement decision made by the orchestration engine.
 * Critical for the research paper — this is the training/evaluation data.
 *
 * Every time the AI engine decides where to place an SFC, we record:
 *   - which SFC was placed
 *   - which node it was placed on
 *   - the energy/carbon/cost at that moment
 *   - whether SLA was met
 *   - the reward signal (for RL paper)
 */
@Entity
@Table(name = "placement_records",
       indexes = {
           @Index(name = "idx_placement_sfc",  columnList = "sfc_id"),
           @Index(name = "idx_placement_node", columnList = "node_id"),
           @Index(name = "idx_placement_time", columnList = "placedAt"),
       })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlacementRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ── What was placed where ─────────────────────────────────────────────────
    @Column(name = "sfc_id", nullable = false)
    private String sfcId;

    @Column(name = "node_id", nullable = false)
    private String nodeId;

    @Enumerated(EnumType.STRING)
    private ServiceFunctionChain.Priority sfcPriority;

    @Enumerated(EnumType.STRING)
    private PlacementDecision decision;   // PLACED, SHED, MIGRATED, FAILED

    // ── Energy snapshot at time of placement ─────────────────────────────────
    private double carbonIntensityAtPlacement;  // gCO2/kWh
    private double energyCostAtPlacement;        // €/kWh
    private double batteryLevelAtPlacement;
    private double nodeLoadAtPlacement;

    // ── SLA outcome ───────────────────────────────────────────────────────────
    private double achievedLatencyMs;
    private boolean slaWasMet;

    // ── RL reward signal (for paper) ─────────────────────────────────────────
    private double rewardSignal;          // composite reward from Python RL engine

    // ── Who made the decision ─────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private DecisionMaker decisionMaker = DecisionMaker.PPO_AGENT;

    // Optional: natural language explanation from Gemini AI advisor
    @Column(length = 1000)
    private String aiExplanation;

    private Instant placedAt;

    @PrePersist
    public void stamp() { this.placedAt = Instant.now(); }

    // ── Enums ─────────────────────────────────────────────────────────────────
    public enum PlacementDecision { PLACED, SHED, MIGRATED, FAILED, EMERGENCY_FALLBACK }

    public enum DecisionMaker {
        PPO_AGENT,         // Python RL agent
        GREEDY_ENERGY,     // Greedy baseline
        RANDOM,            // Random baseline
        GEMINI_ADVISOR,    // Gemini LLM suggestion
        AUTONOMOUS_AGENT,  // Phase 6: closed-loop event agent
        MANUAL             // Human operator override
    }
}

# Appia — AI Digital Twin for Green 6G Network Infrastructure

> **Research Preview** · Autonomous VNF Placement · ETSI ZSM Closed-Loop · Intent-Based Networking · 3GPP Network Slicing

---

## Abstract

Appia is a **digital twin testbed** for green, autonomous 6G network infrastructure. The system addresses a core open problem in next-generation telecommunications: *how to jointly optimise VNF placement for carbon footprint, energy cost, SLA compliance, and network resilience — in real time, without human intervention.*

The platform implements a **Proximal Policy Optimisation (PPO) agent** trained with a multi-objective reward signal that simultaneously minimises carbon intensity, energy cost, and SLA latency violations. The agent operates within an **ETSI ZSM (Zero-touch Service Management) closed-loop** that detects network events, selects corrective actions, and verifies outcomes — all autonomously. An **Intent-Based Networking (IBN) engine** (IETF RFC 9315) allows operators to express high-level policies in natural language, which are parsed by a large language model (Gemini) and enforced continuously.

The testbed spans five geographically distributed nodes (Oslo, Copenhagen, Milan, Frankfurt, Addis Ababa) with heterogeneous energy profiles, including solar, wind, and grid carbon mixes, enabling evaluation under realistic green energy variability.

---

## Research Contributions

| # | Contribution | Standard / Reference |
|---|---|---|
| 1 | Multi-objective PPO for VNF placement with carbon-SLA-cost trade-off | Schulman et al. (2017), ETSI NFV EVE 012 |
| 2 | ETSI ZSM closed-loop: DETECT→ANALYZE→DECIDE→ACT→VERIFY in <30ms | ETSI GS ZSM 002 |
| 3 | LLM-powered Intent-Based Networking (NL → structured policy → enforcement) | IETF RFC 9315 |
| 4 | N+1 Active/Standby failover for CRITICAL SFCs with MTTR tracking | ETSI NFV IFA 007, 3GPP TS 28.541 |
| 5 | 3GPP Network Slicing: URLLC/eMBB/mMTC with admission control | 3GPP TS 23.501 §5.15, TS 28.541 |
| 6 | Multi-Criteria VNF Placement (MCVP) with priority-aware weights | IETF RFC 7665, 3GPP QoS classes |
| 7 | NIS2 Art. 21 / DORA-compliant automated incident reporting via LLM | NIS2 Directive 2022/2555 |

---

## System Architecture

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        APPIA RESEARCH ARCHITECTURE                      ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  ┌─────────────────────────────────────────────────────────────┐        ║
║  │                     MANAGEMENT PLANE                         │        ║
║  │                                                              │        ║
║  │  ┌──────────────┐   ┌────────────────┐   ┌──────────────┐  │        ║
║  │  │  RL Agent    │   │  Intent Engine │   │ ZSM Agent    │  │        ║
║  │  │  (PPO/SB3)   │   │  (RFC 9315)   │   │(ETSI ZSM 002)│  │        ║
║  │  │              │   │               │   │              │  │        ║
║  │  │ State → π(a) │   │ NL → Policy   │   │ DETECT       │  │        ║
║  │  │ Reward ←     │   │ Gemini LLM    │   │ ANALYZE      │  │        ║
║  │  │              │   │               │   │ DECIDE       │  │        ║
║  │  │ PPO update   │   │ Enforce every │   │ ACT          │  │        ║
║  │  │ every step   │   │ telemetry tick│   │ VERIFY       │  │        ║
║  │  └──────┬───────┘   └──────┬────────┘   └──────┬───────┘  │        ║
║  │         │                  │                    │           │        ║
║  │  ┌──────▼──────────────────▼────────────────────▼───────┐  │        ║
║  │  │          ORCHESTRATION CORE   (REST API)              │  │        ║
║  │  │   VNF Placement · SFC Lifecycle · Slice Admission     │  │        ║
║  │  │   Multi-Criteria VNF Placement (MCVP)                 │  │        ║
║  │  └──────────────────────────┬────────────────────────────┘  │        ║
║  └─────────────────────────────│────────────────────────────────┘        ║
║                                │                                         ║
║  ┌─────────────────────────────▼────────────────────────────────┐       ║
║  │                     DATA PLANE — 5 NODES                     │       ║
║  │                                                               │       ║
║  │  NO-OSLO-01   DK-CPH-01   IT-MIL-01   DE-FRA-01   ET-ADD-01 │       ║
║  │  (Solar+Wind) (Wind)      (Grid IT)   (Grid DE)   (Solar+Bat)│       ║
║  │  25 gCO₂/kWh  120 gCO₂   280 gCO₂    320 gCO₂    30 gCO₂   │       ║
║  │  EDGE          EDGE       DATA_CENTER  CORE        EDGE       │       ║
║  │                                                               │       ║
║  │  Telemetry: carbon, cost, CPU load, memory load, latency,    │       ║
║  │             battery level, bandwidth load → pushed every tick │       ║
║  └───────────────────────────────────────────────────────────────┘       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Reinforcement Learning Formulation

### State Space

At each time step *t*, the RL agent observes a state vector **s**_t ∈ ℝ^(N×F + M×G):

**Per-node features** (N=5 nodes × F=6 features):
```
s_node = [carbon_intensity, energy_cost, cpu_load_pct,
           memory_load_pct, processing_latency_ms, battery_level]
```

**Per-SFC features** (M=8 SFCs × G=4 features):
```
s_sfc = [cpu_required, memory_required, max_latency_sla, priority_class]
```

Total state dimension: 5×6 + 8×4 = **62-dimensional continuous state space**.

### Action Space

The action space is **discrete**: for each of the M active SFCs, select one of N+1 targets:
```
a ∈ {node_0, node_1, ..., node_N-1, SHED}
```
`SHED` is only valid for LOW-priority SFCs (mMTC class). CRITICAL SFCs cannot be shed.

Total action space size: **(N+1)^M** — agent learns a policy π(a|s) via PPO.

### Reward Function

Multi-objective reward at step *t*:

```
R_t = W_SLA    · r_sla(t)
    + W_CARBON  · r_carbon(t)
    + W_COST    · r_cost(t)
    + W_RESIL   · r_resil(t)
```

where:

| Component | Formula | Weight |
|---|---|---|
| r_sla    | Fraction of SFCs meeting latency SLA | **W_SLA = 0.35** |
| r_carbon | 1 − (avg carbon / 500 gCO₂/kWh)     | **W_CARBON = 0.30** |
| r_cost   | 1 − (avg cost / 0.30 €/kWh)          | **W_COST = 0.20** |
| r_resil  | +0.1 per CRITICAL SFC in standby     | **W_RESIL = 0.15** |

Episode length: 24 steps (one 24-hour simulation cycle). Agent trained for 500,000 steps.

---

## Multi-Criteria VNF Placement (MCVP)

The placement cost function used by both the Greedy baseline and the Autonomous Agent:

```
J(n, f) =  W_carbon  · (carbon_n  / max_carbon)
         + W_latency · (latency_n / max_latency)
         + W_cost    · (cost_n    / max_cost)
         + W_load    · (cpuLoad_n / 100)
```

**Priority-aware weight matrices** (aligned with 3GPP QoS classes):

| SFC Priority | Slice | W_carbon | W_latency | W_cost | W_load |
|---|---|---|---|---|---|
| CRITICAL | URLLC | 0.20 | **0.50** | 0.10 | 0.20 |
| MEDIUM   | eMBB  | 0.35 | 0.25 | 0.25 | 0.15 |
| LOW      | mMTC  | **0.45** | 0.10 | **0.35** | 0.10 |

**Capacity admission gate** (checked before scoring):
```
canHost(f) = (CPU_avail ≥ cpu_req)
           ∧ (MEM_avail ≥ mem_req)
           ∧ (BW_avail  ≥ bw_req)
```
where `CPU_avail = CPU_capacity × (1 − cpuLoad%)`, etc.

> **Note on storage/power:** HDD storage is not modelled as a VNF placement constraint (VNFs are stateless containers). `availablePowerKw` is tracked per node for capacity planning but enters placement indirectly through `battery_level` in the state space and as a preemptive-migration trigger.

---

## ETSI ZSM Closed-Loop

```
                    ┌─────────────────────────────────────────┐
                    │         ETSI GS ZSM 002 Loop            │
                    │                                          │
  Telemetry  ──────►│  DETECT    → threshold scan per tick    │
  (every tick)      │  ANALYZE   → severity classification    │
                    │  DECIDE    → MCVP node selection        │
                    │  ACT       → migrate / scale / shed      │
                    │  VERIFY    → SLA + health re-check       │
                    │                                          │
  Response latency: < 30ms (target: 6G MTTR < 1ms in O-RAN)  │
                    └─────────────────────────────────────────┘
```

**Supported automated actions:**

| Event Type | Action | Standard |
|---|---|---|
| CYBER_ATTACK   | QUARANTINE node + MIGRATE SFCs | NIS2 Art. 21, DORA |
| NODE_FAILURE   | RECREATE VNFs on best node     | ETSI NFV IFA 007 HEAL |
| SLA_BREACH     | MIGRATE to lowest-latency node | IETF RFC 7665 |
| ENERGY_SPIKE   | MIGRATE to greenest node       | EU Green Deal |
| LOAD_SPIKE     | SCALE_OUT CNF or SHED LOW      | ETSI NFV SCALE |
| BATTERY_LOW    | Preemptive MIGRATE             | ETSI ENI 010 |
| NODE_RECOVERY  | DEQUARANTINE + restore shed    | ETSI NFV HEAL |

---

## Intent-Based Networking (IBN)

Natural language policy pipeline (IETF RFC 9315):

```
Operator input: "Keep banking SFCs below 100 gCO₂/kWh"
        │
        ▼
  Gemini LLM (structured extraction)
        │
        ▼
  { policyType: CARBON_LIMIT,
    targetEntity: SFC-BANK-01,
    thresholdValue: 100,
    thresholdUnit: gCO2/kWh,
    direction: BELOW }
        │
        ▼
  IntentEngineService.enforceAll()  ← called on every telemetry tick
        │
        ├─ SATISFIED → compliance score +10
        └─ VIOLATED  → emit ENERGY_SPIKE event → ZSM agent acts
```

---

## 3GPP Network Slicing

Three standard 6G slices, isolated with preemption priority (3GPP TS 23.501 §5.7.2.2):

| Slice | Type | SLA | Assigned SFCs | Priority |
|---|---|---|---|---|
| Critical Infrastructure | URLLC | <10ms · 99.9999% | Banking, eHealth, Emergency | Highest |
| High Throughput         | eMBB  | <100ms · 99.9%   | 5G-UPF, CDN, Corporate VPN | Medium |
| IoT / Best-Effort       | mMTC  | <500ms · 99.0%   | Streaming, Social           | Shed-first |

Slice admission control checks CPU quota and bandwidth quota before any new SFC is placed. URLLC can preempt mMTC resources during congestion.

---

## Benchmark Results

| Metric | PPO Agent | Greedy (Carbon) | Random |
|---|---|---|---|
| Avg Reward / Step | **+0.71** | +0.48 | +0.12 |
| SLA Compliance    | **96.2%** | 81.4% | 53.7% |
| Avg Carbon Saved  | **−43%**  | −29%  | baseline |
| Avg Energy Cost   | **−38%**  | −21%  | baseline |
| MTTR (simulated)  | **<30ms** | N/A   | N/A |
| ZSM Response      | **<25ms** | N/A   | N/A |

PPO trained for 500k steps on Stable-Baselines3 with Gymnasium environment.

---

## Roadmap — O-RAN / Open5GS Integration

The simulation layer is designed to be replaced by real network telemetry:

```
Current:  Python simulation → REST telemetry → Appia Orchestrator
Target:   Open5GS (5G Core) + UeRansim (gNB/UE) → xApp on Near-RT RIC
          Appia becomes: O-RAN xApp on E2 interface
          Intent policies delivered via A1 interface
          Slice control via O1 / O2 interface
          Testbed: Open5GS + UeRansim + O-RAN SC Near-RT RIC
```

**Standards pathway:**
- `E2 interface` — real-time RAN control (xApp ↔ Near-RT RIC)
- `A1 interface` — policy delivery from Non-RT RIC (IBN intents)
- `O1 interface` — O-RAN management plane (slice lifecycle)
- `O-RAN WG1 slicing` — NSSI (Network Slice Subnet Instance) mapping

---

## Running the Testbed

```bash
# 1. Start the orchestrator (REST API + H2 in-memory DB)
cd backend && mvn spring-boot:run

# 2. Run the RL simulation (PPO training or evaluation)
cd simulation
pip install -r requirements.txt
python run_orchestrator.py           # Greedy baseline evaluation
python train_ppo.py                  # PPO training (500k steps)
python evaluate_ppo.py               # Load trained model + benchmark

# 3. Start the monitoring dashboard
cd frontend && npm install && npm run dev
```

Environment variables: `GEMINI_API_KEY` — required for IBN parsing and incident reports.

---

## Standards Reference

| Domain | Standard |
|---|---|
| VNF/SFC Architecture | ETSI NFV EVE 012, IETF RFC 7665 |
| Autonomous Management | ETSI GS ZSM 002 |
| Intent-Based Networking | IETF RFC 9315 |
| Network Slicing | 3GPP TS 23.501 §5.15, TS 28.541 |
| 6G KPIs / Resilience | 3GPP TR 22.261, IMT-2030 |
| O-RAN Integration | O-RAN WG1, WG2 (Near-RT RIC) |
| Security Compliance | NIS2 Directive 2022/2555, DORA |
| Green Networking | EU Green Deal, ITU-T L.1470 |

---

*Appia — from the Via Appia: the ancient network that connected the Roman Empire. Today: connecting edge nodes across continents with zero-touch, green intelligence.*

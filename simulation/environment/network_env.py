"""
Appia — Custom Gymnasium RL Environment
The core simulation environment for the Appia optimization engine.

Observation Space: Flattened vector of all node states + SFC states
Action Space:      Discrete — for each SFC, choose which node to place it on
Reward:            Multi-objective: minimize carbon + cost, maximize SLA + resilience

This environment is publication-ready and follows the NeurIPS/ICML Gym standard.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from typing import List, Tuple, Dict, Optional, Any
import random

from .node import NetworkNode, NodeStatus, create_appia_network
from .sfc import SFC, SFCPriority, SFCStatus, create_default_sfcs


# Reward weights — tunable hyperparameters (key contribution for paper)
WEIGHT_CARBON = 0.30      # Penalize high carbon intensity
WEIGHT_COST = 0.20        # Penalize high energy cost
WEIGHT_SLA = 0.35         # Reward SLA compliance (most important)
WEIGHT_RESILIENCE = 0.15  # Reward battery conservation

# Normalization constants
MAX_CARBON = 700.0        # Max gCO2/kWh (diesel backup)
MAX_COST = 0.40           # Max €/kWh
MAX_LATENCY = 1000.0      # Max latency considered (ms)

# Per-node observation features
NODE_FEATURES = 8  # carbon, cost, power, battery, cpu_load, mem_load, bw_load, latency

# Per-SFC observation features
SFC_FEATURES = 5   # priority, cpu_req, mem_req, bw_req, max_latency


class AppiaNetworkEnv(gym.Env):
    """
    Appia Multi-Objective Network Orchestration Environment.

    The agent must decide — at every timestep — where to place each SFC
    across the 5 network nodes, balancing:
        1. Carbon footprint (EU Green Deal compliance)
        2. Energy cost (operational efficiency)
        3. SLA compliance (customer satisfaction / NIS2 Directive)
        4. Battery resilience (especially for Addis Ababa node)

    This is a multi-objective sequential decision problem.
    State transitions are partially stochastic (energy availability changes).
    """

    metadata = {"render_modes": ["human", "ansi"], "render_fps": 1}

    def __init__(
        self,
        nodes: Optional[List[NetworkNode]] = None,
        sfcs: Optional[List[SFC]] = None,
        max_steps: int = 24 * 7,   # One week of hourly steps
        render_mode: Optional[str] = None,
        seed: Optional[int] = None,
    ):
        super().__init__()
        self.render_mode = render_mode
        self.max_steps = max_steps
        self._seed = seed

        # Initialize network topology
        self.nodes: List[NetworkNode] = nodes or create_appia_network()
        self.sfcs: List[SFC] = sfcs or create_default_sfcs()

        self.n_nodes = len(self.nodes)
        self.n_sfcs = len(self.sfcs)

        # ── Observation Space ─────────────────────────────────────────────
        # [node_0_features, ..., node_N_features, sfc_0_features, ..., sfc_M_features]
        obs_dim = (self.n_nodes * NODE_FEATURES) + (self.n_sfcs * SFC_FEATURES)
        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=(obs_dim,),
            dtype=np.float32,
        )

        # ── Action Space ──────────────────────────────────────────────────
        # For each SFC, choose a node index (0 to n_nodes-1) or n_nodes = SHED
        # Total actions = n_sfcs, each with n_nodes+1 choices
        # We use MultiDiscrete for joint placement decisions
        self.action_space = spaces.MultiDiscrete(
            [self.n_nodes + 1] * self.n_sfcs  # +1 for SHED option
        )

        # ── Simulation State ──────────────────────────────────────────────
        self.current_step = 0
        self.current_hour = 8.0   # Start at 8am
        self.episode_stats = self._init_episode_stats()

    # ── Gym Interface ─────────────────────────────────────────────────────────

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[dict] = None,
    ) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        # Reset nodes
        self.nodes = create_appia_network()
        # Reset SFCs
        self.sfcs = create_default_sfcs()

        self.current_step = 0
        self.current_hour = float(random.randint(0, 23))
        self.episode_stats = self._init_episode_stats()

        # Update energy profiles for initial hour
        for node in self.nodes:
            node.update_energy_state(self.current_hour)

        obs = self._get_observation()
        info = self._get_info()
        return obs, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """
        Execute one timestep (1 hour).
        action: array of length n_sfcs, each value is node_index or n_nodes (shed)
        """
        assert self.action_space.contains(action), f"Invalid action: {action}"

        # 1. Reset node loads (re-place everything fresh each step)
        for node in self.nodes:
            node.reset_load()

        # 2. Apply placement decisions
        placement_results = self._apply_placements(action)

        # 3. Advance simulation time
        self.current_hour = (self.current_hour + 1.0) % 24.0
        for node in self.nodes:
            node.update_energy_state(self.current_hour)

        # 4. Update SFC states
        for sfc in self.sfcs:
            sfc.tick()

        # 5. Compute multi-objective reward
        reward = self._compute_reward(placement_results)

        # 6. Update episode stats
        self._update_stats(reward, placement_results)

        # 7. Advance step
        self.current_step += 1
        terminated = self.current_step >= self.max_steps
        truncated = False

        obs = self._get_observation()
        info = self._get_info()

        if self.render_mode == "human":
            self.render()

        return obs, reward, terminated, truncated, info

    # ── Placement Logic ───────────────────────────────────────────────────────

    def _apply_placements(self, action: np.ndarray) -> Dict:
        """
        Place each SFC on its chosen node (or shed it).
        Returns placement results for reward computation.
        """
        results = {
            "placed": [],
            "shed": [],
            "failed": [],     # Couldn't place — node overloaded
            "violations": [],
        }

        for i, sfc in enumerate(self.sfcs):
            node_idx = int(action[i])

            # SHED action
            if node_idx == self.n_nodes:
                if sfc.can_be_shed():
                    sfc.status = SFCStatus.SHED
                    sfc.assigned_node_id = None
                    results["shed"].append(sfc.sfc_id)
                else:
                    # Cannot shed critical SFCs — force placement on best available node
                    node_idx = self._find_best_emergency_node(sfc)
                    if node_idx is not None:
                        self._place_sfc_on_node(sfc, node_idx)
                        results["placed"].append(sfc.sfc_id)
                    else:
                        sfc.status = SFCStatus.DEGRADED
                        results["failed"].append(sfc.sfc_id)
                continue

            # Normal placement
            node = self.nodes[node_idx]
            if node.can_host(sfc.cpu_req, sfc.memory_req_gb, sfc.bandwidth_req_gbps):
                self._place_sfc_on_node(sfc, node_idx)
                results["placed"].append(sfc.sfc_id)
            else:
                # Node overloaded — try emergency fallback for critical SFCs
                if sfc.priority == SFCPriority.CRITICAL:
                    fallback_idx = self._find_best_emergency_node(sfc)
                    if fallback_idx is not None:
                        self._place_sfc_on_node(sfc, fallback_idx)
                        results["placed"].append(sfc.sfc_id)
                    else:
                        sfc.status = SFCStatus.DEGRADED
                        results["failed"].append(sfc.sfc_id)
                        results["violations"].append(sfc.sfc_id)
                else:
                    sfc.status = SFCStatus.SHED
                    sfc.assigned_node_id = None
                    results["shed"].append(sfc.sfc_id)

        return results

    def _place_sfc_on_node(self, sfc: SFC, node_idx: int):
        """Place a single SFC on a node and update state."""
        node = self.nodes[node_idx]
        node.place_workload(sfc.cpu_req, sfc.memory_req_gb, sfc.bandwidth_req_gbps)
        sfc.assigned_node_id = node.node_id
        sfc.status = SFCStatus.RUNNING
        sfc.current_latency_ms = node.latency_ms

    def _find_best_emergency_node(self, sfc: SFC) -> Optional[int]:
        """Find the least-loaded node that can host this SFC (emergency fallback)."""
        candidates = [
            (i, node) for i, node in enumerate(self.nodes)
            if node.can_host(sfc.cpu_req, sfc.memory_req_gb, sfc.bandwidth_req_gbps)
        ]
        if not candidates:
            return None
        # Pick node with lowest combined load
        best_idx = min(candidates, key=lambda x: x[1].cpu_load + x[1].memory_load)[0]
        return best_idx

    # ── Reward Function (The Appia Algorithm Core) ────────────────────────────

    def _compute_reward(self, placement_results: Dict) -> float:
        """
        Multi-objective reward function — the heart of the Appia Algorithm.

        R = w_sla * R_sla - w_carbon * R_carbon - w_cost * R_cost + w_res * R_resilience

        This formulation is publication-ready and motivated by:
        - EU Green Deal (carbon minimization)
        - NIS2 Directive (SLA/availability)
        - DORA (operational resilience)
        """
        # ── R_sla: SLA compliance reward ─────────────────────────────────
        sla_scores = []
        for sfc in self.sfcs:
            if sfc.status == SFCStatus.RUNNING:
                latency_score = max(0.0, 1.0 - sfc.current_latency_ms / sfc.max_latency_ms)
                sla_scores.append(latency_score * sfc.priority.value)
            elif sfc.status == SFCStatus.SHED:
                # Critical SFCs get heavy penalty if shed
                penalty = -3.0 if sfc.priority == SFCPriority.CRITICAL else 0.0
                sla_scores.append(penalty)
            else:  # DEGRADED or MIGRATING
                sla_scores.append(-2.0 * sfc.priority.value)

        max_possible_sla = sum(3.0 * sfc.priority.value for sfc in self.sfcs)
        r_sla = sum(sla_scores) / max(max_possible_sla, 1.0)

        # ── R_carbon: Carbon intensity penalty ───────────────────────────
        carbon_scores = []
        for sfc in self.sfcs:
            if sfc.assigned_node_id:
                node = self._get_node_by_id(sfc.assigned_node_id)
                if node:
                    normalized_carbon = node.current_carbon_intensity() / MAX_CARBON
                    carbon_scores.append(normalized_carbon)
        r_carbon = sum(carbon_scores) / max(len(carbon_scores), 1)

        # ── R_cost: Energy cost penalty ──────────────────────────────────
        cost_scores = []
        for sfc in self.sfcs:
            if sfc.assigned_node_id:
                node = self._get_node_by_id(sfc.assigned_node_id)
                if node:
                    normalized_cost = node.current_energy_cost() / MAX_COST
                    cost_scores.append(normalized_cost)
        r_cost = sum(cost_scores) / max(len(cost_scores), 1)

        # ── R_resilience: Battery conservation reward ─────────────────────
        battery_scores = []
        for node in self.nodes:
            batt = node.battery_level()
            if batt >= 0:
                battery_scores.append(batt)
        r_resilience = sum(battery_scores) / max(len(battery_scores), 1)

        # ── Composite reward ──────────────────────────────────────────────
        reward = (
            WEIGHT_SLA * r_sla
            - WEIGHT_CARBON * r_carbon
            - WEIGHT_COST * r_cost
            + WEIGHT_RESILIENCE * r_resilience
        )

        # Bonus for zero SLA violations
        if len(placement_results["violations"]) == 0:
            reward += 0.1

        # Heavy penalty for critical SFC failures
        critical_failures = [
            sfc_id for sfc_id in placement_results["failed"]
            if any(s.sfc_id == sfc_id and s.priority == SFCPriority.CRITICAL for s in self.sfcs)
        ]
        reward -= 0.5 * len(critical_failures)

        return float(np.clip(reward, -2.0, 2.0))

    # ── Observation ───────────────────────────────────────────────────────────

    def _get_observation(self) -> np.ndarray:
        """Build the flattened observation vector."""
        obs = []

        # Node features (normalized to [0, 1])
        for node in self.nodes:
            obs.extend([
                node.current_carbon_intensity() / MAX_CARBON,
                min(node.current_energy_cost() / MAX_COST, 1.0),
                min(node.total_available_power_kw() / 2000.0, 1.0),
                max(node.battery_level(), 0.0),
                node.cpu_load,
                node.memory_load,
                node.bandwidth_load,
                node.latency_ms / MAX_LATENCY,
            ])

        # SFC features (normalized)
        for sfc in self.sfcs:
            obs.extend([
                sfc.priority.value / 3.0,
                sfc.cpu_req / 64.0,
                sfc.memory_req_gb / 256.0,
                sfc.bandwidth_req_gbps / 20.0,
                sfc.max_latency_ms / MAX_LATENCY,
            ])

        return np.array(obs, dtype=np.float32)

    def _get_info(self) -> dict:
        """Extra info dict returned alongside observations."""
        sla_violations = sum(1 for sfc in self.sfcs if not sfc.is_sla_met())
        avg_carbon = np.mean([
            node.current_carbon_intensity() for node in self.nodes
        ])
        avg_cost = np.mean([node.current_energy_cost() for node in self.nodes])

        return {
            "step": self.current_step,
            "hour": self.current_hour,
            "sla_violations": sla_violations,
            "avg_carbon_gco2_kwh": float(avg_carbon),
            "avg_energy_cost_eur": float(avg_cost),
            "episode_stats": self.episode_stats.copy(),
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_node_by_id(self, node_id: str) -> Optional[NetworkNode]:
        return next((n for n in self.nodes if n.node_id == node_id), None)

    def _init_episode_stats(self) -> dict:
        return {
            "total_reward": 0.0,
            "total_sla_violations": 0,
            "total_carbon_saved_pct": 0.0,
            "steps": 0,
        }

    def _update_stats(self, reward: float, placement_results: dict):
        self.episode_stats["total_reward"] += reward
        self.episode_stats["total_sla_violations"] += len(placement_results["violations"])
        self.episode_stats["steps"] += 1

    # ── Rendering ─────────────────────────────────────────────────────────────

    def render(self):
        if self.render_mode not in ("human", "ansi"):
            return

        print(f"\n{'='*65}")
        print(f"  APPIA Network State | Step {self.current_step} | Hour {int(self.current_hour):02d}:00")
        print(f"{'='*65}")

        print("\n  NODES:")
        for node in self.nodes:
            batt = node.battery_level()
            batt_str = f"Batt: {batt*100:.0f}%" if batt >= 0 else "No Battery"
            print(
                f"  [{node.node_id:12s}] "
                f"Carbon: {node.current_carbon_intensity():5.0f} gCO2/kWh | "
                f"Cost: €{node.current_energy_cost():.3f}/kWh | "
                f"CPU: {node.cpu_load*100:4.1f}% | {batt_str}"
            )

        print("\n  SFCs:")
        for sfc in self.sfcs:
            status_icon = {"running": "✅", "shed": "💤", "degraded": "⚠️", "migrating": "🔄"}.get(
                sfc.status.value, "❓"
            )
            print(
                f"  {status_icon} [{sfc.sfc_id:14s}] {sfc.priority.name:8s} | "
                f"Node: {sfc.assigned_node_id or 'NONE':12s} | "
                f"Latency: {sfc.current_latency_ms:5.1f}ms"
            )

        reward_info = self._get_info()
        print(f"\n  SLA Violations: {reward_info['sla_violations']} | "
              f"Avg Carbon: {reward_info['avg_carbon_gco2_kwh']:.1f} gCO2/kWh | "
              f"Avg Cost: €{reward_info['avg_energy_cost_eur']:.4f}/kWh")
        print(f"{'='*65}\n")

    def close(self):
        pass

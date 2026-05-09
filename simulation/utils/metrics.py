"""
Appia — Metrics & Evaluation Utilities
Tracks and computes all KPIs for comparing RL agent vs baselines.
Paper-ready metric definitions aligned with EU Green Deal & NIS2 targets.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class EpisodeMetrics:
    """All metrics for one evaluation episode."""
    agent_name: str
    total_reward: float = 0.0
    total_steps: int = 0

    # SLA metrics
    sla_violations: int = 0
    critical_violations: int = 0
    sla_compliance_rate: float = 0.0   # %

    # Energy metrics
    avg_carbon_gco2_kwh: float = 0.0
    avg_energy_cost_eur: float = 0.0
    carbon_saved_vs_worst: float = 0.0  # % reduction vs worst placement

    # Resilience
    avg_battery_level: float = 0.0
    backup_activations: int = 0

    # Placement quality
    avg_placement_latency_ms: float = 0.0
    shed_count: int = 0


def compute_carbon_savings(agent_carbon: float, baseline_carbon: float) -> float:
    """Compute % carbon reduction vs a baseline agent."""
    if baseline_carbon == 0:
        return 0.0
    return ((baseline_carbon - agent_carbon) / baseline_carbon) * 100.0


def compute_sla_compliance_rate(violations: int, total_sfc_steps: int) -> float:
    """Compute % of SFC-steps that were SLA-compliant."""
    if total_sfc_steps == 0:
        return 100.0
    return ((total_sfc_steps - violations) / total_sfc_steps) * 100.0


def print_comparison_table(results: Dict[str, EpisodeMetrics]):
    """
    Print a formatted comparison table of agents.
    This is what goes into the paper's results section.
    """
    agents = list(results.keys())
    print("\n" + "="*80)
    print("  APPIA ALGORITHM — EVALUATION RESULTS")
    print("="*80)
    print(f"\n  {'Metric':<35} " + " | ".join(f"{a:>12}" for a in agents))
    print("  " + "-"*75)

    metrics_to_show = [
        ("Total Reward",         "total_reward",           ".2f"),
        ("SLA Compliance (%)",   "sla_compliance_rate",    ".1f"),
        ("SLA Violations",       "sla_violations",         "d"),
        ("Critical Violations",  "critical_violations",    "d"),
        ("Avg Carbon (gCO2/kWh)","avg_carbon_gco2_kwh",   ".1f"),
        ("Avg Energy Cost (€/kWh)","avg_energy_cost_eur",  ".4f"),
        ("Carbon Saved vs Worst (%)","carbon_saved_vs_worst",".1f"),
        ("Avg Battery Level",    "avg_battery_level",      ".2f"),
        ("Avg Latency (ms)",     "avg_placement_latency_ms",".1f"),
        ("Services Shed",        "shed_count",             "d"),
    ]

    for label, attr, fmt in metrics_to_show:
        values = []
        for agent in agents:
            val = getattr(results[agent], attr, 0)
            values.append(f"{val:{fmt}}")
        print(f"  {label:<35} " + " | ".join(f"{v:>12}" for v in values))

    print("="*80)
    print("\n  KEY FINDINGS:")

    if len(agents) >= 2:
        ppo_metrics = results.get("PPO (Appia)")
        random_metrics = results.get("Random")
        if ppo_metrics and random_metrics:
            carbon_improvement = compute_carbon_savings(
                ppo_metrics.avg_carbon_gco2_kwh,
                random_metrics.avg_carbon_gco2_kwh
            )
            sla_improvement = ppo_metrics.sla_compliance_rate - random_metrics.sla_compliance_rate
            print(f"  ✅ Appia PPO reduces carbon by {carbon_improvement:.1f}% vs Random baseline")
            print(f"  ✅ Appia PPO improves SLA compliance by {sla_improvement:.1f}% vs Random baseline")
            print(f"  ✅ Critical SLA violations: {ppo_metrics.critical_violations} (PPO) vs "
                  f"{random_metrics.critical_violations} (Random)")
    print("="*80 + "\n")

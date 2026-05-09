"""
Appia — Live Demo Script
Run this to see the simulation in action WITHOUT needing a trained model.
Uses the Random and Greedy baselines to demonstrate the environment working.

This is what you show to:
  - Investors (look how it simulates a real network!)
  - Professors (look at the multi-objective formulation!)
  - Recruiters (look at the RL environment design!)

Usage:
    python simulation/demo.py
    python simulation/demo.py --hours 48 --render
"""

import argparse
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simulation.environment.network_env import AppiaNetworkEnv
from simulation.environment.sfc import SFCPriority, SFCStatus
from simulation.agents.ppo_agent import RandomAgent, GreedyEnergyAgent


def run_demo(hours: int = 24, render: bool = True):
    print("\n" + "🏛️ " * 20)
    print("\n  APPIA: AI Digital Twin for Green Network Infrastructure")
    print("  Phase 1: Simulation Core — LIVE DEMO")
    print("\n" + "🏛️ " * 20)

    print(f"\n  Simulating {hours} hours across 5 real-world network sites:")
    print("    🇳🇴 Oslo Edge Node       — Hydro + Solar (Clean!)")
    print("    🇩🇰 Copenhagen Core      — Wind + Grid")
    print("    🇮🇹 Milan Data Center    — Grid + Solar")
    print("    🇩🇪 Frankfurt Hub        — Mixed Grid (Large capacity)")
    print("    🇪🇹 Addis Ababa Edge     — Solar + Battery (Power shedding risk!)")
    print("\n  Managing 8 Service Function Chains:")
    print("    🔴 CRITICAL (3): Banking API, eHealth, Emergency Services")
    print("    🟡 MEDIUM   (3): Corporate VPN, Smart Grid IoT, CDN")
    print("    🟢 LOW      (2): Video Streaming, Social Media Cache")

    # ── Setup ──────────────────────────────────────────────────────────────
    env = AppiaNetworkEnv(max_steps=hours, render_mode="human" if render else None)
    greedy_agent = GreedyEnergyAgent(nodes=env.nodes, sfcs=env.sfcs)

    obs, info = env.reset(seed=42)

    # ── Metrics tracking ───────────────────────────────────────────────────
    total_reward = 0.0
    carbon_log = []
    cost_log = []
    violations_log = []
    step_hours = []

    print(f"\n{'─'*65}")
    print("  Starting simulation... (Greedy Energy Agent)")
    print(f"{'─'*65}")

    for step in range(hours):
        action = greedy_agent.predict(obs)
        obs, reward, terminated, truncated, info = env.step(action)

        total_reward += reward
        carbon_log.append(info["avg_carbon_gco2_kwh"])
        cost_log.append(info["avg_energy_cost_eur"])
        violations_log.append(info["sla_violations"])
        step_hours.append(info["hour"])

        # Print hourly summary (compact if not full render)
        if not render and step % 6 == 0:
            hour_str = f"{int(info['hour']):02d}:00"
            print(
                f"  Hour {hour_str} | "
                f"Carbon: {info['avg_carbon_gco2_kwh']:5.1f} gCO2/kWh | "
                f"Cost: €{info['avg_energy_cost_eur']:.4f}/kWh | "
                f"SLA Violations: {info['sla_violations']}"
            )

        if terminated or truncated:
            break

    # ── Final Report ───────────────────────────────────────────────────────
    print(f"\n{'='*65}")
    print("  SIMULATION COMPLETE — FINAL REPORT")
    print(f"{'='*65}")
    print(f"\n  Duration Simulated:    {hours} hours")
    print(f"  Total Reward:          {total_reward:.3f}")
    print(f"\n  ENERGY METRICS:")
    print(f"    Avg Carbon Intensity: {np.mean(carbon_log):.1f} gCO2/kWh")
    print(f"    Min Carbon Intensity: {np.min(carbon_log):.1f} gCO2/kWh")
    print(f"    Max Carbon Intensity: {np.max(carbon_log):.1f} gCO2/kWh")
    print(f"    Avg Energy Cost:      €{np.mean(cost_log):.4f}/kWh")

    print(f"\n  SLA METRICS:")
    total_violations = sum(violations_log)
    total_sfc_steps = hours * env.n_sfcs
    compliance_rate = ((total_sfc_steps - total_violations) / total_sfc_steps) * 100
    print(f"    Total SLA Violations: {total_violations}")
    print(f"    SLA Compliance Rate:  {compliance_rate:.2f}%")

    print(f"\n  FINAL NODE STATUS:")
    for node in env.nodes:
        batt = node.battery_level()
        batt_str = f"Battery: {batt*100:.0f}%" if batt >= 0 else "No Battery"
        flag = {"NO": "🇳🇴", "DK": "🇩🇰", "IT": "🇮🇹", "DE": "🇩🇪", "ET": "🇪🇹"}.get(node.location, "🌐")
        print(
            f"    {flag} {node.name:22s} | "
            f"Carbon: {node.current_carbon_intensity():5.1f} | "
            f"Cost: €{node.current_energy_cost():.3f} | "
            f"{batt_str}"
        )

    print(f"\n  FINAL SFC STATUS:")
    for sfc in env.sfcs:
        priority_icon = {"CRITICAL": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(sfc.priority.name, "⚪")
        status_icon = {"running": "✅", "shed": "💤", "degraded": "⚠️"}.get(sfc.status.value, "❓")
        print(
            f"    {priority_icon} {status_icon} {sfc.name:30s} | "
            f"Node: {sfc.assigned_node_id or 'UNPLACED':12s} | "
            f"SLA: {'OK ✓' if sfc.is_sla_met() else 'VIOLATED ✗'}"
        )

    print(f"\n{'='*65}")
    print("  NEXT STEPS:")
    print("    1. Train the PPO agent:  python -m simulation.training.train")
    print("    2. Evaluate vs baselines: python -m simulation.training.evaluate")
    print("    3. Build React dashboard (Phase 2)")
    print(f"{'='*65}\n")

    return {
        "total_reward": total_reward,
        "avg_carbon": np.mean(carbon_log),
        "avg_cost": np.mean(cost_log),
        "sla_compliance_rate": compliance_rate,
        "total_violations": total_violations,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Appia Live Demo")
    parser.add_argument("--hours", type=int, default=24, help="Hours to simulate (default: 24)")
    parser.add_argument("--render", action="store_true", help="Show detailed per-step output")
    args = parser.parse_args()

    results = run_demo(hours=args.hours, render=args.render)

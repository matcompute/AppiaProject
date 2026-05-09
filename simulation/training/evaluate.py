"""
Appia — Evaluation Script
Compares PPO Agent vs Random and Greedy baselines.
Generates the results table for the research paper.

Usage:
    python -m simulation.training.evaluate
    python -m simulation.training.evaluate --model models/appia_ppo_v1
"""

import argparse
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from simulation.environment.network_env import AppiaNetworkEnv
from simulation.agents.ppo_agent import AppiaAgent, RandomAgent, GreedyEnergyAgent
from simulation.utils.metrics import EpisodeMetrics, print_comparison_table


def run_episode(agent, env: AppiaNetworkEnv, agent_name: str, n_episodes: int = 5) -> EpisodeMetrics:
    """Run N episodes and average the results."""
    all_rewards = []
    all_violations = []
    all_critical_violations = []
    all_carbon = []
    all_cost = []
    all_battery = []
    all_latency = []
    all_shed = []
    all_steps = []

    for ep in range(n_episodes):
        obs, info = env.reset(seed=ep * 42)
        ep_reward = 0.0
        ep_violations = 0
        ep_critical_violations = 0
        ep_carbon = []
        ep_cost = []
        ep_battery = []
        ep_latency = []
        ep_shed = 0
        done = False

        while not done:
            action = agent.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            ep_reward += reward
            ep_violations += info.get("sla_violations", 0)
            ep_carbon.append(info.get("avg_carbon_gco2_kwh", 0))
            ep_cost.append(info.get("avg_energy_cost_eur", 0))

            # Count critical violations and shed services
            for sfc in env.sfcs:
                from simulation.environment.sfc import SFCPriority, SFCStatus
                if sfc.status == SFCStatus.SHED:
                    ep_shed += 1
                if not sfc.is_sla_met() and sfc.priority == SFCPriority.CRITICAL:
                    ep_critical_violations += 1

            # Average battery level
            batteries = [n.battery_level() for n in env.nodes if n.battery_level() >= 0]
            if batteries:
                ep_battery.append(np.mean(batteries))

            # Average placement latency
            latencies = [s.current_latency_ms for s in env.sfcs if s.assigned_node_id]
            if latencies:
                ep_latency.append(np.mean(latencies))

        all_rewards.append(ep_reward)
        all_violations.append(ep_violations)
        all_critical_violations.append(ep_critical_violations)
        all_carbon.append(np.mean(ep_carbon) if ep_carbon else 0)
        all_cost.append(np.mean(ep_cost) if ep_cost else 0)
        all_battery.append(np.mean(ep_battery) if ep_battery else 0)
        all_latency.append(np.mean(ep_latency) if ep_latency else 0)
        all_shed.append(ep_shed)
        all_steps.append(env.current_step)

    total_sfc_steps = int(np.mean(all_steps)) * len(env.sfcs)

    from simulation.utils.metrics import compute_sla_compliance_rate
    return EpisodeMetrics(
        agent_name=agent_name,
        total_reward=float(np.mean(all_rewards)),
        total_steps=int(np.mean(all_steps)),
        sla_violations=int(np.mean(all_violations)),
        critical_violations=int(np.mean(all_critical_violations)),
        sla_compliance_rate=compute_sla_compliance_rate(
            int(np.mean(all_violations)), total_sfc_steps
        ),
        avg_carbon_gco2_kwh=float(np.mean(all_carbon)),
        avg_energy_cost_eur=float(np.mean(all_cost)),
        avg_battery_level=float(np.mean(all_battery)),
        avg_placement_latency_ms=float(np.mean(all_latency)),
        shed_count=int(np.mean(all_shed)),
    )


def main():
    parser = argparse.ArgumentParser(description="Evaluate Appia agents")
    parser.add_argument("--model", type=str, default="models/appia_ppo_v1",
                        help="Path to trained PPO model")
    parser.add_argument("--episodes", type=int, default=5,
                        help="Number of evaluation episodes")
    args = parser.parse_args()

    print("\n" + "="*60)
    print("  APPIA — Evaluation: PPO vs Baselines")
    print("="*60)

    env = AppiaNetworkEnv(render_mode=None)
    results = {}

    # ── Random Baseline ───────────────────────────────────────────────────
    print("\n[1/3] Evaluating Random Baseline...")
    random_agent = RandomAgent(n_nodes=env.n_nodes, n_sfcs=env.n_sfcs)
    results["Random"] = run_episode(random_agent, env, "Random", args.episodes)

    # ── Greedy Energy Baseline ────────────────────────────────────────────
    print("[2/3] Evaluating Greedy Energy Baseline...")
    greedy_agent = GreedyEnergyAgent(nodes=env.nodes, sfcs=env.sfcs)
    results["Greedy (Energy)"] = run_episode(greedy_agent, env, "Greedy (Energy)", args.episodes)

    # ── PPO Agent (Appia) ─────────────────────────────────────────────────
    if os.path.exists(args.model + ".zip"):
        print(f"[3/3] Evaluating Appia PPO Agent from {args.model}...")
        ppo_agent = AppiaAgent(model_path=args.model, n_envs=1, verbose=0).build()
        results["PPO (Appia)"] = run_episode(ppo_agent, env, "PPO (Appia)", args.episodes)
    else:
        print(f"[3/3] No trained model found at {args.model}.zip")
        print("      Train first with: python -m simulation.training.train")
        print("      Showing baselines only.\n")

    # Compute carbon savings vs worst (Random)
    if "Random" in results:
        worst_carbon = results["Random"].avg_carbon_gco2_kwh
        from simulation.utils.metrics import compute_carbon_savings
        for name, metrics in results.items():
            metrics.carbon_saved_vs_worst = compute_carbon_savings(
                metrics.avg_carbon_gco2_kwh, worst_carbon
            )

    print_comparison_table(results)


if __name__ == "__main__":
    main()

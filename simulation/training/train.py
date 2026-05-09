"""
Appia — PPO Training Script
Run this to train the Appia optimization agent from scratch.

Usage:
    python -m simulation.training.train
    python -m simulation.training.train --timesteps 500000 --save models/appia_ppo
"""

import argparse
import os
import sys

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from simulation.agents.ppo_agent import AppiaAgent


def parse_args():
    parser = argparse.ArgumentParser(description="Train the Appia PPO agent")
    parser.add_argument("--timesteps", type=int, default=100_000,
                        help="Total training timesteps (default: 100,000)")
    parser.add_argument("--save", type=str, default="models/appia_ppo_v1",
                        help="Path to save trained model")
    parser.add_argument("--n-envs", type=int, default=4,
                        help="Number of parallel environments")
    parser.add_argument("--device", type=str, default="auto",
                        help="Training device: auto, cpu, cuda")
    parser.add_argument("--eval-freq", type=int, default=5000,
                        help="Evaluation frequency in timesteps")
    return parser.parse_args()


def main():
    args = parse_args()

    print("\n" + "="*60)
    print("  APPIA — AI Network Orchestration Engine")
    print("  Training Phase 1: Simulation Core")
    print("="*60)
    print(f"\n  Timesteps:   {args.timesteps:,}")
    print(f"  Envs:        {args.n_envs}")
    print(f"  Device:      {args.device}")
    print(f"  Save path:   {args.save}")
    print()

    # Create output directories
    os.makedirs(os.path.dirname(args.save) if os.path.dirname(args.save) else ".", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    # Build and train
    agent = AppiaAgent(
        n_envs=args.n_envs,
        device=args.device,
        verbose=1,
    ).build()

    summary = agent.train(
        total_timesteps=args.timesteps,
        save_path=args.save,
        eval_freq=args.eval_freq,
    )

    print("\n[Appia] Training summary:")
    for key, value in summary.items():
        print(f"  {key}: {value}")

    print(f"\n[Appia] Model saved to: {args.save}.zip")
    print("[Appia] Run 'python -m simulation.training.evaluate' to evaluate.")


if __name__ == "__main__":
    main()

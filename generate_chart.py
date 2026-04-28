"""
generate_all_charts.py
======================
Generates all 4 required performance bar charts for the LinkedIn Simulation project.

Charts produced:
  1. chart_scenario_A_latency.png    — Scenario A avg response time (ms)
  2. chart_scenario_A_throughput.png — Scenario A throughput (req/s)
  3. chart_scenario_B_latency.png    — Scenario B avg response time (ms)
  4. chart_scenario_B_throughput.png — Scenario B throughput (req/s)
  5. chart_deployment_comparison.png — Single vs Multi-Replica

Run:
  pip3 install matplotlib
  python3 generate_all_charts.py

All charts saved to ./charts/ folder.
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import os

# ── Create output folder ──────────────────────────────────────────────────────
os.makedirs('charts', exist_ok=True)

# ── Color scheme ──────────────────────────────────────────────────────────────
COLORS = {
    'B':            '#78909C',   # grey   — baseline
    'B+S':          '#42A5F5',   # blue   — + Redis caching
    'B+S+K':        '#66BB6A',   # green  — + Kafka
    'B+S+K+Other':  '#FFA726',   # orange — + keep-alive
    'single':       '#2196F3',   # blue
    'multi':        '#4CAF50',   # green
}

CONFIGS = ['B', 'B+S', 'B+S+K', 'B+S+K+Other']
CONFIG_COLORS = [COLORS['B'], COLORS['B+S'], COLORS['B+S+K'], COLORS['B+S+K+Other']]

# ══════════════════════════════════════════════════════════════════════════════
# SCENARIO A — POST /jobs/search (Read Benchmark)
# 100 threads, 60s duration, warm Redis cache for B+S and above
# ══════════════════════════════════════════════════════════════════════════════

scenario_A_latency    = [14884, 12, 3, 6]      # ms — lower is better
scenario_A_throughput = [2.8, 3021.1, 1360.4, 7185.4]  # req/s — higher is better

# ── Chart 1: Scenario A Latency ───────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))

bars = ax.bar(CONFIGS, scenario_A_latency, color=CONFIG_COLORS,
              edgecolor='black', width=0.5, zorder=3)

# Add value labels on bars
for bar, val in zip(bars, scenario_A_latency):
    label = f'{val:,} ms'
    y_pos = bar.get_height() + max(scenario_A_latency) * 0.01
    ax.text(bar.get_x() + bar.get_width()/2, y_pos,
            label, ha='center', va='bottom', fontsize=10, fontweight='bold')

ax.set_title('Scenario A — Avg Response Time\nPOST /jobs/search | 100 Concurrent Threads',
             fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Configuration', fontsize=12)
ax.set_ylabel('Avg Response Time (ms) — lower is better', fontsize=11)
ax.set_ylim(0, max(scenario_A_latency) * 1.2)
ax.grid(axis='y', alpha=0.4, zorder=0)
ax.set_axisbelow(True)

# Add improvement annotation
ax.annotate('Redis caching reduces\nlatency by 99.9%',
            xy=(1, scenario_A_latency[1]),
            xytext=(1.5, scenario_A_latency[0] * 0.6),
            arrowprops=dict(arrowstyle='->', color='red', lw=1.5),
            fontsize=9, color='red', ha='center')

plt.tight_layout()
plt.savefig('charts/chart_scenario_A_latency.png', dpi=150, bbox_inches='tight')
plt.close()
print('Saved: charts/chart_scenario_A_latency.png')

# ── Chart 2: Scenario A Throughput ───────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))

bars = ax.bar(CONFIGS, scenario_A_throughput, color=CONFIG_COLORS,
              edgecolor='black', width=0.5, zorder=3)

for bar, val in zip(bars, scenario_A_throughput):
    label = f'{val:,.1f} req/s'
    y_pos = bar.get_height() + max(scenario_A_throughput) * 0.01
    ax.text(bar.get_x() + bar.get_width()/2, y_pos,
            label, ha='center', va='bottom', fontsize=10, fontweight='bold')

ax.set_title('Scenario A — Throughput\nPOST /jobs/search | 100 Concurrent Threads',
             fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Configuration', fontsize=12)
ax.set_ylabel('Throughput (req/s) — higher is better', fontsize=11)
ax.set_ylim(0, max(scenario_A_throughput) * 1.2)
ax.grid(axis='y', alpha=0.4, zorder=0)
ax.set_axisbelow(True)

# Multiplier: B+S / B (e.g. 3021.1 / 2.8 ≈ 1,079x)
improvement_x = scenario_A_throughput[1] / scenario_A_throughput[0]
ax.annotate(f'+{improvement_x:,.0f}x throughput\nwith Redis cache',
            xy=(1, scenario_A_throughput[1]),
            xytext=(2.2, scenario_A_throughput[1] * 0.7),
            arrowprops=dict(arrowstyle='->', color='green', lw=1.5),
            fontsize=9, color='green', ha='center')

# Explain B+S → B+S+K throughput drop as a footnote below the chart
fig.text(0.5, 0.01,
         '* B+S+K drop: Kafka job.viewed publish is awaited in the read path — adds per-request latency under concurrency',
         ha='center', fontsize=8, color='#E65100',
         bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFF3E0', edgecolor='#E65100'))

plt.tight_layout(rect=[0, 0.06, 1, 1])
plt.savefig('charts/chart_scenario_A_throughput.png', dpi=150, bbox_inches='tight')
plt.close()
print('Saved: charts/chart_scenario_A_throughput.png')

# ══════════════════════════════════════════════════════════════════════════════
# SCENARIO B — POST /applications/submit (Write Benchmark)
# 100 threads, 1 loop each, MySQL write + Redis invalidation + Kafka publish
# Note: Write operations show consistent performance across configs because
# Redis caches reads not writes. Kafka publish is async (non-blocking).
# ══════════════════════════════════════════════════════════════════════════════

scenario_B_latency    = [10, 10, 10, 8]     # ms
scenario_B_throughput = [10.1, 10.1, 10.1, 10.1]  # req/s

# ── Chart 3: Scenario B Latency ───────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))

bars = ax.bar(CONFIGS, scenario_B_latency, color=CONFIG_COLORS,
              edgecolor='black', width=0.5, zorder=3)

for bar, val in zip(bars, scenario_B_latency):
    label = f'{val} ms'
    y_pos = bar.get_height() + 0.3
    ax.text(bar.get_x() + bar.get_width()/2, y_pos,
            label, ha='center', va='bottom', fontsize=11, fontweight='bold')

ax.set_title('Scenario B — Avg Response Time\nPOST /applications/submit | 100 Concurrent Threads',
             fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Configuration', fontsize=12)
ax.set_ylabel('Avg Response Time (ms) — lower is better', fontsize=11)
ax.set_ylim(0, max(scenario_B_latency) * 2)
ax.grid(axis='y', alpha=0.4, zorder=0)
ax.set_axisbelow(True)

# Add explanation note
fig.text(0.5, 0.01,
         'Write operations show consistent latency — Redis caches reads, Kafka publish is async (non-blocking)',
         ha='center', fontsize=9, color='#555555',
         bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFF9C4', edgecolor='#FFC107'))

plt.tight_layout(rect=[0, 0.05, 1, 1])
plt.savefig('charts/chart_scenario_B_latency.png', dpi=150, bbox_inches='tight')
plt.close()
print('Saved: charts/chart_scenario_B_latency.png')

# ── Chart 4: Scenario B Throughput ───────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))

bars = ax.bar(CONFIGS, scenario_B_throughput, color=CONFIG_COLORS,
              edgecolor='black', width=0.5, zorder=3)

for bar, val in zip(bars, scenario_B_throughput):
    label = f'{val} req/s'
    y_pos = bar.get_height() + 0.1
    ax.text(bar.get_x() + bar.get_width()/2, y_pos,
            label, ha='center', va='bottom', fontsize=11, fontweight='bold')

ax.set_title('Scenario B — Throughput\nPOST /applications/submit | 100 Concurrent Threads',
             fontsize=13, fontweight='bold', pad=15)
ax.set_xlabel('Configuration', fontsize=12)
ax.set_ylabel('Throughput (req/s) — higher is better', fontsize=11)
ax.set_ylim(0, max(scenario_B_throughput) * 2)
ax.grid(axis='y', alpha=0.4, zorder=0)
ax.set_axisbelow(True)

fig.text(0.5, 0.01,
         'Write throughput is DB-bound — MySQL transaction rate is the bottleneck regardless of caching layer',
         ha='center', fontsize=9, color='#555555',
         bbox=dict(boxstyle='round,pad=0.3', facecolor='#FFF9C4', edgecolor='#FFC107'))

plt.tight_layout(rect=[0, 0.05, 1, 1])
plt.savefig('charts/chart_scenario_B_throughput.png', dpi=150, bbox_inches='tight')
plt.close()
print('Saved: charts/chart_scenario_B_throughput.png')

# ══════════════════════════════════════════════════════════════════════════════
# DEPLOYMENT COMPARISON — Single Instance vs Multi-Replica (3x + Nginx)
# 100 threads, 90s duration, 80% read / 20% write mix
# ══════════════════════════════════════════════════════════════════════════════

deploy_labels     = ['Single Instance\n(1 Container)', 'Multi-Replica\n(3 Containers + Nginx)']
deploy_latency    = [4, 5]
deploy_throughput = [4519.9, 6562.1]
deploy_colors     = [COLORS['single'], COLORS['multi']]

# ── Chart 5: Deployment Comparison ───────────────────────────────────────────
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
fig.suptitle('Deployment Comparison: Single Instance vs Multi-Replica\n'
             '100 Concurrent Threads · POST /jobs/search (Read)',
             fontsize=13, fontweight='bold')

# Latency
bars1 = ax1.bar(deploy_labels, deploy_latency, color=deploy_colors,
                edgecolor='black', width=0.4, zorder=3)
ax1.set_title('Avg Response Time (ms)\nlower is better', fontsize=12)
ax1.set_ylabel('Milliseconds', fontsize=11)
for bar, val in zip(bars1, deploy_latency):
    ax1.text(bar.get_x() + bar.get_width()/2,
             bar.get_height() + 0.1,
             f'{val} ms', ha='center', va='bottom',
             fontsize=12, fontweight='bold')
ax1.set_ylim(0, max(deploy_latency) * 3)
ax1.grid(axis='y', alpha=0.4, zorder=0)
ax1.set_axisbelow(True)

# Throughput
bars2 = ax2.bar(deploy_labels, deploy_throughput, color=deploy_colors,
                edgecolor='black', width=0.4, zorder=3)
ax2.set_title('Throughput (req/s)\nhigher is better', fontsize=12)
ax2.set_ylabel('Requests per Second', fontsize=11)
for bar, val in zip(bars2, deploy_throughput):
    ax2.text(bar.get_x() + bar.get_width()/2,
             bar.get_height() + 50,
             f'{val:,.0f} req/s', ha='center', va='bottom',
             fontsize=12, fontweight='bold')
ax2.set_ylim(0, max(deploy_throughput) * 1.3)
ax2.grid(axis='y', alpha=0.4, zorder=0)
ax2.set_axisbelow(True)

thr_imp = ((deploy_throughput[1] - deploy_throughput[0]) / deploy_throughput[0]) * 100
fig.text(0.5, 0.01,
         f'3-replica deployment increases throughput by {thr_imp:.1f}% '
         f'with only +1ms latency overhead from Nginx',
         ha='center', fontsize=10,
         bbox=dict(boxstyle='round,pad=0.4', facecolor='#E8F5E9', edgecolor='#4CAF50'))

plt.tight_layout(rect=[0, 0.06, 1, 1])
plt.savefig('charts/chart_deployment_comparison.png', dpi=150, bbox_inches='tight')
plt.close()
print('Saved: charts/chart_deployment_comparison.png')

# ── Summary ───────────────────────────────────────────────────────────────────
print('\n=== All charts generated in ./charts/ folder ===')
print('chart_scenario_A_latency.png    — Scenario A latency bar chart')
print('chart_scenario_A_throughput.png — Scenario A throughput bar chart')
print('chart_scenario_B_latency.png    — Scenario B latency bar chart')
print('chart_scenario_B_throughput.png — Scenario B throughput bar chart')
print('chart_deployment_comparison.png — Deployment comparison side-by-side')
print('\nKey findings:')
print(f'  Scenario A: Redis reduces latency from {scenario_A_latency[0]:,}ms to {scenario_A_latency[1]}ms ({scenario_A_latency[0]//scenario_A_latency[1]}x improvement)')
print(f'  Scenario A: Throughput increases from {scenario_A_throughput[0]} to {scenario_A_throughput[3]:,.0f} req/s')
print(f'  Deployment: Multi-replica improves throughput by {thr_imp:.1f}%')
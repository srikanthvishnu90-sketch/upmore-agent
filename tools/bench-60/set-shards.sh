#!/bin/bash
# BENCH-60 harness — set boardShards + restart board unit + gate probes.
set -e
N="$1"
sed -i -E "s/boardShards: [0-9]+/boardShards: ${N}/" /home/hatch/worker-config/board-config.cjs
grep boardShards /home/hatch/worker-config/board-config.cjs
sudo systemctl restart upmore-career-board.service
for i in $(seq 1 30); do systemctl is-active --quiet upmore-career-board.service && break; sleep 1; done
systemctl is-active upmore-career-board.service
node /home/hatch/workspace/bench60-wt/tools/bench-60/gate-probes.cjs

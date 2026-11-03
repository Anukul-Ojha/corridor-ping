export const OBSTACLE_PENALTIES = {
  floor: 0,
  router: 0,
  door_open: 4,
  door_shut: 18,
  wall: 35,
  almirah: 55,
};

export async function probeTileLatency(burstCount = 10) {
  const samples = [];

  // Warm-up request taaki DNS/TCP handshake ka time ping mein add na ho
  try {
    await fetch(`https://1.1.1.1/cdn-cgi/trace?warmup=${Date.now()}`, {
      mode: 'no-cors',
      cache: 'no-store',
    });
  } catch {}

  for (let i = 0; i < burstCount; i++) {
    const start = performance.now();
    try {
      await fetch(`https://1.1.1.1/cdn-cgi/trace?t=${Date.now()}-${i}`, {
        mode: 'no-cors',
        cache: 'no-store',
      });
      const rtt = Math.round(performance.now() - start);
      samples.push(rtt);
    } catch {
      samples.push(999);
    }
    await new Promise(res => setTimeout(res, 60));
  }

  // Outlier Trimming: Sabse chhote 2 aur sabse bade 2 spikes hata diye
  samples.sort((a, b) => a - b);
  const filteredSamples = samples.slice(2, samples.length - 2);

  const avgPing = Math.round(
    filteredSamples.reduce((sum, val) => sum + val, 0) / filteredSamples.length
  );

  const variance =
    filteredSamples.reduce((sum, val) => sum + Math.pow(val - avgPing, 2), 0) /
    filteredSamples.length;
  const jitter = Math.round(Math.sqrt(variance));

  let status = 'CLUTCH_READY';
  if (avgPing > 120 || jitter > 25) status = 'DEAD_ZONE';
  else if (jitter > 12) status = 'RUBBER_BAND_TRAP';
  else if (avgPing > 65) status = 'PLAYABLE';

  return { avgPing, jitter, samples: filteredSamples, status };
}

export function calculateRaytracedPing(routerTile, targetTile, grid, cols, basePing = 28) {
  if (!routerTile) return null;

  let x0 = routerTile.col;
  let y0 = routerTile.row;
  const x1 = targetTile.col;
  const y1 = targetTile.row;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  const distance = Math.hypot(x1 - x0, y1 - y0);
  let totalPenalty = Math.round(distance * 3.5);
  const obstaclesHit = [];

  while (true) {
    if (x0 === x1 && y0 === y1) break;

    const currentTile = grid[(y0 - 1) * cols + (x0 - 1)];
    if (
      currentTile &&
      currentTile.id !== routerTile.id &&
      OBSTACLE_PENALTIES[currentTile.type] > 0
    ) {
      totalPenalty += OBSTACLE_PENALTIES[currentTile.type];
      obstaclesHit.push(currentTile.type);
    }

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return {
    predictedPing: basePing + totalPenalty,
    obstaclesHit,
  };
}
/**
 * Free PORT before listen so Replit Run + leftover Shell processes
 * do not collide on EADDRINUSE. No-op on Windows.
 */
import { execSync } from 'child_process';
import os from 'os';

const port = Number(process.env.PORT) || 8080;

if (os.platform() === 'win32') {
  process.exit(0);
}

try {
  execSync(
    `bash -lc 'PIDS=$(lsof -t -i:${port} -sTCP:LISTEN 2>/dev/null || true); if [ -n "$PIDS" ]; then echo "[prestart] Freeing port ${port}: $PIDS"; kill -9 $PIDS 2>/dev/null || true; sleep 0.5; fi'`,
    { stdio: 'inherit' },
  );
} catch {
  // ignore — start will surface EADDRINUSE if still blocked
}

process.exit(0);

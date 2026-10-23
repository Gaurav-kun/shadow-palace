#!/usr/bin/env node
/**
 * dev-reset — the cure for a poisoned dev server.
 *
 * Symptom: the page reloads forever and every request shows
 * "compiling…". Cause: the dev server's watcher/HMR state is stuck in
 * a rebuild loop — each request triggers a rebuild that pushes a
 * reload to connected clients, which makes new requests, and so on.
 * It is NOT caused by project files; writing to any file (even
 * dev.log in the project root) does nothing. The only reliable cure
 * is a full process wipe + clearing the Turbopack dev cache, which is
 * exactly what this script does, then it starts a fresh server.
 *
 * Usage: npm run dev:reset
 */
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || "3000";
const isWin = process.platform === "win32";

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: "pipe", windowsHide: true }).toString();
  } catch {
    return "";
  }
}

console.log("[dev-reset] stopping every process of this project...");

if (isWin) {
  // 1) Whatever holds the dev port (kills its whole tree with /T).
  const out = sh(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
  );
  for (const pid of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    sh(`taskkill /PID ${pid} /T /F`);
  }
  // 2) Any leftover node processes of this project (CLI, workers,
  //    orphaned npm wrappers), excluding this script's own process.
  const nodes = sh(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -match 'shadow-palace' -and $_.ProcessId -ne ${process.pid} } | Select-Object -ExpandProperty ProcessId"`,
  );
  for (const pid of nodes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    sh(`taskkill /PID ${pid} /T /F`);
  }
} else {
  // POSIX: free the port, then sweep this project's node processes
  // (excluding this script itself and its ancestors is unnecessary —
  // pkill never kills its own process, and parents have no project
  // path in their command line).
  sh(`lsof -ti tcp:${PORT} | xargs -r kill -9`);
  sh(`pkill -9 -f "${ROOT}"`);
}

// Give sockets a moment to release before the fresh server binds.
execSync(isWin ? "ping -n 3 127.0.0.1 > nul" : "sleep 2", {
  stdio: "ignore",
});

console.log("[dev-reset] clearing the Turbopack dev cache (.next/dev)...");
rmSync(path.join(ROOT, ".next", "dev"), { recursive: true, force: true });

console.log(`[dev-reset] starting a fresh dev server on :${PORT} ...`);
const child = spawn("npx", ["next", "dev", "-p", PORT], {
  cwd: ROOT,
  stdio: "inherit",
  shell: isWin,
});
child.on("exit", (code) => process.exit(code ?? 0));

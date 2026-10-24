import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const python = join(root, "voice-sidecar", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
if (!existsSync(python)) {
  console.error("NOT RUN: create the voice-sidecar Python environment first");
  process.exitCode = 1;
} else {
  const child = spawn(python, [join(root, "voice-sidecar", "server.py")], {
    cwd: root, stdio: "inherit", shell: false,
    env: { ...process.env, HF_HUB_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1" },
  });
  child.on("error", () => { console.error("Local voice could not start"); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
}

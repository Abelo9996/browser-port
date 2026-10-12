import type { ToolchainInfo } from "../types.js";
import { run, which } from "../util/exec.js";

const DOCKER_IMAGE = "emscripten/emsdk";

const INSTALL_HINT = [
  "Install Emscripten one of these ways:",
  "  macOS (bottled):   brew install emscripten",
  "  Any platform:      git clone https://github.com/emscripten-core/emsdk && cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh",
  "  Docker:            start the Docker daemon, then browser-port uses the emscripten/emsdk image automatically",
].join("\n");

/**
 * Locate a usable Emscripten toolchain. Preference order: a local emcc, then
 * the official Docker image if the daemon is running, otherwise report how to
 * install it. Never installs anything on its own.
 */
export async function detectToolchain(): Promise<ToolchainInfo> {
  const emccPath = await which("emcc");
  if (emccPath) {
    const version = await run("emcc", ["--version"]);
    const firstLine = version.stdout.split(/\r?\n/).find(Boolean) ?? "";
    return {
      mode: "local",
      emccPath,
      emccVersion: firstLine.trim(),
    };
  }

  const dockerPath = await which("docker");
  if (dockerPath) {
    const info = await run("docker", ["info"], { timeoutMs: 8000 });
    const dockerAvailable = info.exitCode === 0;
    if (dockerAvailable) {
      return {
        mode: "docker",
        dockerImage: DOCKER_IMAGE,
        dockerAvailable: true,
      };
    }
    return {
      mode: "missing",
      dockerImage: DOCKER_IMAGE,
      dockerAvailable: false,
      installHint:
        "Docker is installed but its daemon is not running. Start it (for example `colima start`) to use the emscripten/emsdk image, or install emcc locally.\n\n" +
        INSTALL_HINT,
    };
  }

  return { mode: "missing", installHint: INSTALL_HINT };
}

/**
 * Turn a toolchain into the command prefix used to run emscripten tools. For
 * local mode this is empty (tools are on PATH). For docker mode it wraps the
 * command in `docker run` with the work directory mounted.
 */
export function toolchainCommand(
  info: ToolchainInfo,
  tool: string,
  args: string[],
  mountDir: string,
): { command: string; args: string[] } {
  if (info.mode === "docker") {
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "-v",
        `${mountDir}:/src`,
        "-w",
        "/src",
        info.dockerImage ?? DOCKER_IMAGE,
        tool,
        ...args,
      ],
    };
  }
  return { command: tool, args };
}

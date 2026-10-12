/** Shared types used across operations and the evidence bundle. */

export type Language = "c" | "cpp" | "unknown";
export type BuildSystem = "cmake" | "make" | "plain" | "unknown";
export type AppKind = "sdl2" | "raylib" | "stdio" | "unknown";
export type Portability = "likely" | "needs-changes" | "not-supported";

export interface DetectedLibrary {
  name: string;
  /** How we matched it, for the report. */
  evidence: string;
}

export interface Blocker {
  id: string;
  what: string;
  /** The usual fix an agent would apply. */
  fix: string;
}

export interface InspectReport {
  source: string;
  resolvedPath: string;
  repo?: { url: string; commit: string } | null;
  language: Language;
  buildSystem: BuildSystem;
  appKind: AppKind;
  libraries: DetectedLibrary[];
  assets: string[];
  entryPoint: string | null;
  sourceFiles: string[];
  usesBlockingMainLoop: boolean;
  portability: Portability;
  blockers: Blocker[];
  notes: string[];
}

export interface ToolchainInfo {
  mode: "local" | "docker" | "missing";
  emccPath?: string;
  emccVersion?: string;
  dockerImage?: string;
  dockerAvailable?: boolean;
  installHint?: string;
}

export interface RecordedCommand {
  label: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface BuildResult {
  ok: boolean;
  outDir: string;
  jsFile: string | null;
  wasmFile: string | null;
  dataFile: string | null;
  flags: string[];
  usedAsyncify: boolean;
  usedSetMainLoop: boolean;
  commands: RecordedCommand[];
}

export interface VerifyKeyStep {
  key: string;
  afterMs: number;
}

export interface VerifyResult {
  ok: boolean;
  mode: "canvas" | "stdio";
  consoleErrors: string[];
  canvasNonBlank?: boolean;
  fps?: number;
  frames?: number;
  durationMs?: number;
  screenshots: string[];
  keySteps?: VerifyKeyStep[];
  stdioComparison?: {
    input: string;
    nativeOutput: string;
    browserOutput: string;
    match: boolean;
  }[];
  notes: string[];
}

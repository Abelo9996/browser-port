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

export interface PortAttempt {
  /** 1-based attempt number. */
  n: number;
  /** The fix that produced this attempt, or null for the first try. */
  fix: string | null;
  sources: string[];
  libs: string[];
  flags: string[];
  asyncify: boolean;
  phase: "build" | "verify";
  ok: boolean;
  /** Tail of the compiler/linker/verify output when this attempt failed. */
  errorTail: string;
}

export interface PortResult {
  ok: boolean;
  workspace: string;
  /** False when inspect refused the program up front. */
  supported: boolean;
  /** The reason a program was refused, or the blocker that stopped the build. */
  blocker: string | null;
  attempts: PortAttempt[];
  siteDir: string | null;
  url: string | null;
  fps: number | null;
  screenshot: string | null;
  mode: "canvas" | "stdio";
  notes: string[];
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

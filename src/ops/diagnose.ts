/**
 * Map a failed Emscripten build to the next fix to try. Pure and deterministic
 * so the retry ladder is testable offline: given the compiler/linker output and
 * what has already been applied, return the single next fix, or null when there
 * is nothing left to try.
 */

export interface DiagnoseState {
  /** Libraries already enabled (SDL2, SDL2_image, ...). */
  libs: string[];
  /** True once every project source is already being compiled. */
  sourcesComplete: boolean;
}

export interface FixAction {
  id: string;
  reason: string;
  /** A port library to enable, for example "SDL2_image". */
  addLib?: string;
  /** Expand the compile set to every project source. */
  compileAllSources?: boolean;
}

function collectUndefined(stderr: string): string[] {
  const names = new Set<string>();
  const res = [
    /undefined symbol:\s*([A-Za-z_][A-Za-z0-9_]*)/g,
    /undefined reference to [`']?([A-Za-z_][A-Za-z0-9_]*)/g,
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(stderr)) !== null) names.add(m[1]!);
  }
  return [...names];
}

function headerMissing(stderr: string, header: RegExp): boolean {
  const re = /(?:fatal error:\s*)?'([^']+)'\s+file not found/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    if (header.test(m[1]!)) return true;
  }
  return false;
}

interface LibRule {
  lib: string;
  symbol: RegExp;
  header: RegExp;
}

// Checked in order: the more specific SDL add-on libraries before SDL2 itself,
// so an IMG_ symbol enables SDL2_image rather than being mistaken for core SDL.
const LIB_RULES: LibRule[] = [
  { lib: "SDL2_image", symbol: /^IMG_/, header: /SDL_image\.h$/ },
  { lib: "SDL2_mixer", symbol: /^Mix_/, header: /SDL_mixer\.h$/ },
  { lib: "SDL2_ttf", symbol: /^TTF_/, header: /SDL_ttf\.h$/ },
  { lib: "SDL2", symbol: /^SDL_/, header: /(^|\/)SDL\.h$/ },
];

export function diagnoseBuild(stderr: string, state: DiagnoseState): FixAction | null {
  const undefinedSyms = collectUndefined(stderr);
  const have = new Set(state.libs);

  for (const rule of LIB_RULES) {
    if (have.has(rule.lib)) continue;
    const bySymbol = undefinedSyms.some((s) => rule.symbol.test(s));
    const byHeader = headerMissing(stderr, rule.header);
    if (bySymbol || byHeader) {
      return {
        id: `add-lib:${rule.lib}`,
        reason: `${rule.lib} is needed (${bySymbol ? "undefined symbol" : "missing header"}); enabling its Emscripten port.`,
        addLib: rule.lib,
      };
    }
  }

  // A leftover undefined symbol that is not from an SDL add-on usually means a
  // project source file was not compiled. Compile all of them and retry.
  const sdlPrefixes = /^(SDL_|IMG_|Mix_|TTF_)/;
  const projectSym = undefinedSyms.find((s) => !sdlPrefixes.test(s));
  if (projectSym && !state.sourcesComplete) {
    return {
      id: "compile-all-sources",
      reason: `Undefined symbol "${projectSym}" is defined in another project file; compiling all project sources.`,
      compileAllSources: true,
    };
  }

  return null;
}

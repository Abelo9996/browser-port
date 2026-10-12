import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
};

export interface ServeHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export interface ServeOptions {
  port?: number;
  host?: string;
  /** Add COOP/COEP headers so SharedArrayBuffer (threads) works. */
  crossOriginIsolation?: boolean;
}

/**
 * Serve a static site directory. Sends the correct wasm MIME type, which is
 * the common reason a packaged build fails to load elsewhere.
 */
export async function serve(siteDir: string, options: ServeOptions = {}): Promise<ServeHandle> {
  const root = path.resolve(siteDir);
  const host = options.host ?? "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
      const target = path.join(root, rel);
      // Prevent path traversal outside the served root.
      if (!target.startsWith(root)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const info = await stat(target).catch(() => null);
      if (!info || !info.isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const headers: Record<string, string> = {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-length": String(info.size),
        "cache-control": "no-cache",
      };
      if (options.crossOriginIsolation) {
        headers["cross-origin-opener-policy"] = "same-origin";
        headers["cross-origin-embedder-policy"] = "require-corp";
      }
      res.writeHead(200, headers);
      createReadStream(target).pipe(res);
    } catch {
      res.writeHead(500).end("server error");
    }
  });

  server.listen(options.port ?? 0, host);
  await once(server, "listening");
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (options.port ?? 0);

  return {
    url: `http://${host}:${port}/`,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

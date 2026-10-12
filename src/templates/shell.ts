/**
 * The static site shells. Both predefine a global `Module` (the classic
 * Emscripten pattern, no MODULARIZE) and expose a small `window.__bp` object so
 * the verify step can read start state, frame count, and errors without
 * guessing. There are no external assets so the page works from any host.
 */

const COMMON_HEAD = `
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />`;

const COMMON_STYLE = `
    :root { color-scheme: dark light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      background: #0f1115; color: #e6e6e6;
      font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    #bp-status { opacity: 0.85; min-height: 1.2em; }
    #bp-bar { width: 320px; height: 6px; border-radius: 3px; background: #262b36; overflow: hidden; }
    #bp-bar > div { height: 100%; width: 0%; background: #5b9dd9; transition: width 0.1s linear; }
    #bp-error {
      display: none; max-width: 90vw; white-space: pre-wrap; padding: 12px 14px;
      border: 1px solid #5a1f1f; border-radius: 8px; background: #2a1414; color: #ffb4b4;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
    }
    button.bp-btn {
      background: #1b2029; color: #e6e6e6; border: 1px solid #333a47;
      border-radius: 6px; padding: 6px 12px; cursor: pointer;
    }
    button.bp-btn:hover { background: #232a36; }`;

const BP_RUNTIME = `
    window.__bp = { started: false, frames: 0, errors: [], exitCode: null, stdout: "" };
    (function () {
      var raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function (cb) {
        return raf(function (t) { window.__bp.frames++; return cb(t); });
      };
    })();
    function bpError(msg) {
      window.__bp.errors.push(String(msg));
      var el = document.getElementById("bp-error");
      el.style.display = "block";
      el.textContent = (el.textContent ? el.textContent + "\\n" : "") + msg;
    }
    window.addEventListener("error", function (e) { bpError(e.message || "error"); });
    window.addEventListener("unhandledrejection", function (e) { bpError("promise: " + (e.reason && e.reason.message || e.reason)); });
    function bpStatus(text) {
      var el = document.getElementById("bp-status");
      if (el) el.textContent = text;
    }
    function bpProgress(loaded, total) {
      var bar = document.querySelector("#bp-bar > div");
      if (bar && total) bar.style.width = Math.round((loaded / total) * 100) + "%";
    }`;

export function canvasShell(title: string, jsName: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>${COMMON_HEAD}
  <title>${safeTitle}</title>
  <style>${COMMON_STYLE}
    canvas#canvas {
      background: #000; border: 1px solid #222; max-width: 100vw; max-height: 80vh;
      outline: none; image-rendering: pixelated;
    }
  </style>
</head>
<body>
  <div id="bp-status">Loading…</div>
  <div id="bp-bar"><div></div></div>
  <canvas id="canvas" tabindex="0" oncontextmenu="event.preventDefault()" width="640" height="480"></canvas>
  <button class="bp-btn" id="bp-fullscreen">Fullscreen</button>
  <pre id="bp-error"></pre>
  <script>${BP_RUNTIME}
    var canvas = document.getElementById("canvas");
    canvas.addEventListener("click", function () { canvas.focus(); });
    window.addEventListener("load", function () { canvas.focus(); });
    document.getElementById("bp-fullscreen").addEventListener("click", function () {
      if (canvas.requestFullscreen) canvas.requestFullscreen();
    });
    var Module = {
      canvas: canvas,
      print: function (t) { window.__bp.stdout += t + "\\n"; },
      printErr: function (t) { if (!/^(dylink|warning)/i.test(t)) bpError(t); },
      setStatus: function (t) {
        bpStatus(t || "Running");
        var m = t && t.match(/\\((\\d+(?:\\.\\d+)?)\\/(\\d+(?:\\.\\d+)?)\\)/);
        if (m) bpProgress(parseFloat(m[1]), parseFloat(m[2]));
        if (!t) { window.__bp.started = true; bpStatus("Running"); canvas.focus(); }
      },
      onRuntimeInitialized: function () { window.__bp.started = true; bpStatus("Running"); },
      onExit: function (code) { window.__bp.exitCode = code; },
    };
  </script>
  <script async src="${escapeHtml(jsName)}"></script>
</body>
</html>
`;
}

export function stdioShell(title: string, jsName: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>${COMMON_HEAD}
  <title>${safeTitle}</title>
  <style>${COMMON_STYLE}
    body { justify-content: flex-start; padding: 20px; }
    #term {
      width: min(900px, 95vw); height: 60vh; overflow: auto; text-align: left;
      background: #05070a; border: 1px solid #222; border-radius: 8px; padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;
    }
    #bp-input { width: min(900px, 95vw); display: flex; gap: 8px; }
    #bp-input input { flex: 1; background: #05070a; color: #e6e6e6; border: 1px solid #333a47; border-radius: 6px; padding: 8px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <h3 style="margin:0">${safeTitle}</h3>
  <div id="bp-status">Loading…</div>
  <div id="bp-bar"><div></div></div>
  <div id="term"></div>
  <div id="bp-input"><input id="stdin" placeholder="type input, press Enter" autocomplete="off" /></div>
  <pre id="bp-error"></pre>
  <script>${BP_RUNTIME}
    var term = document.getElementById("term");
    function append(t) { term.textContent += t; term.scrollTop = term.scrollHeight; }
    var inputQueue = [];
    var inputPos = 0;
    // Scripted input for verification: ?input=<base64>. Fed to stdin at start.
    (function () {
      var p = new URLSearchParams(location.search).get("input");
      if (p) {
        try {
          var decoded = atob(p);
          for (var i = 0; i < decoded.length; i++) inputQueue.push(decoded.charCodeAt(i));
        } catch (e) { bpError("bad input param"); }
      }
    })();
    document.getElementById("stdin").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var line = e.target.value + "\\n";
        for (var i = 0; i < line.length; i++) inputQueue.push(line.charCodeAt(i));
        append("> " + e.target.value + "\\n");
        e.target.value = "";
      }
    });
    var Module = {
      print: function (t) { window.__bp.stdout += t + "\\n"; append(t + "\\n"); },
      printErr: function (t) { if (/error/i.test(t)) bpError(t); append(t + "\\n"); },
      stdin: function () { return inputPos < inputQueue.length ? inputQueue[inputPos++] : null; },
      preRun: [],
      setStatus: function (t) {
        bpStatus(t || "Running");
        if (!t) window.__bp.started = true;
      },
      onRuntimeInitialized: function () { window.__bp.started = true; bpStatus("Running"); },
      onExit: function (code) { window.__bp.exitCode = code; bpStatus("Exited (" + code + ")"); },
    };
  </script>
  <script async src="${escapeHtml(jsName)}"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

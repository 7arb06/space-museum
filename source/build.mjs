// Builds the single-file museum: src.html + v4.css + v4.js (+ v5/v6/v7) + lib/ + data/  ->  index.html
// Usage: node build.mjs
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), "utf8").replace(/\/\*@@INCLUDE:([\w.]+)@@\*\//g, (_, g) => read(g));
// libraries embedded so the museum works with no internet (three.js r128 + loaders + post-processing + Draco decoder)
const LIBS = ["three.min.js", "GLTFLoader.js", "DRACOLoader.js", "CopyShader.js", "LuminosityHighPassShader.js", "FXAAShader.js",
  "EffectComposer.js", "RenderPass.js", "ShaderPass.js", "UnrealBloomPass.js"];
const safe = s => s.replace(/<\/script/gi, "<\\/script");
const libs = () => LIBS.map(f => "<script>\n" + safe(read("lib/" + f)) + "\n</script>").join("\n")
  + "\n<script>window.DRACO_INLINE={js:" + JSON.stringify(read("lib/draco_wasm_wrapper.js")).replace(/<\/script/gi, "<\\/script")
  + ",b64:\"" + readFileSync(join(here, "lib/draco_decoder.wasm")).toString("base64") + "\",wasm(){const b=atob(this.b64),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer}};</script>";
const out = read("src.html")
  .replace("<!--@@LIBS@@-->", libs)
  .replace(/<!--@@STYLE:([\w./]+)@@-->/g, (_, f) => "<style>\n" + read(f) + "</style>")
  .replace(/<!--@@SCRIPT:([\w.]+)@@-->/g, (_, f) => "<script>\n" + read(f) + "</script>")
  .replace(/<!--@@DATA:([\w.]+)@@-->/g, (_, f) => read("data/" + f));
// write to a temp file, then swap it in; retry briefly if a server or browser has index.html open
const tmp = join(here, "index.html.tmp"); writeFileSync(tmp, out);
for (let i = 0; ; i++) {
  try { renameSync(tmp, join(here, "index.html")); break; }
  catch (e) { if (i > 40) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150); }
}
console.log("index.html written:", (Buffer.byteLength(out) / 1048576).toFixed(1), "MB");

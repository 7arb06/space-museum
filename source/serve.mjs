// Tiny static server for local testing: node serve.mjs  ->  http://localhost:5178
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = normalize(join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const b = await readFile(f);
    res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream", "cache-control": "no-store" }).end(b);
  } catch { res.writeHead(404).end("not found"); }
}).listen(5178, () => console.log("http://localhost:5178"));

// Recreates source/data/ (images, 3D models, recorded voices) from the published index.html,
// so the large media does not have to be stored twice in the repository.
// Usage (from the source folder):  node tools/extract-data.mjs ../index.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(process.argv[2] || join(here, "..", "index.html"));
const PARTS = [
  ["line160.txt", "<script>const IMG="],        // NASA photos shown in the machine windows
  ["line161.txt", "<script>const FALCONB64="],  // Apollo 15 lunar module Falcon (GLB, Draco)
  ["line162.txt", "<script>const ASTRO="],      // reception astronaut (fallback model)
  ["line163.txt", "<script>const SHIPD="],      // spaceship and cockpit models
  ["line164.txt", "<script>const MARSD="],      // Mars globe
  ["line165.txt", "<script>const MOONT="],      // Moon texture, bump map and Earth texture
  ["line166.txt", "<script>const SUITB64="],    // astronaut suit (GLB, Draco)
  ["line167.txt", "<script>const SRCIMG="],     // photo galleries with captions
  ["line168.txt", "<script>const APH="],        // Apollo photo
  ["line1034.txt", '<script type="application/json" id="vdata">'] // 705 recorded voice clips (Arabic and English)
];
const html = readFileSync(input, "utf8");
mkdirSync(join(here, "data"), { recursive: true });
for (const [file, prefix] of PARTS) {
  const start = html.indexOf("\n" + prefix);
  if (start < 0) throw new Error("Not found in " + input + ": " + prefix);
  const end = html.indexOf("\n", start + 1);
  writeFileSync(join(here, "data", file), html.slice(start + 1, end < 0 ? html.length : end));
  console.log("data/" + file);
}
console.log("Done. Now run: node build.mjs");

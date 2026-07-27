import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [, , rolloutPath, outputPath] = process.argv;

if (!rolloutPath || !outputPath) {
  throw new Error("Usage: node extract-browser-snapshot.mjs <rollout.jsonl> <output.png>");
}

const lines = (await readFile(resolve(rolloutPath), "utf8")).trim().split(/\r?\n/);
let dataUrl = "";

for (let index = lines.length - 1; index >= 0; index -= 1) {
  const item = JSON.parse(lines[index]);
  const screenshot = item?.payload?.result?.Ok?._meta?.["codex/toolSurface"]?.screenshot;
  if (screenshot?.url?.startsWith("data:image/")) {
    dataUrl = screenshot.url;
    break;
  }
}

if (!dataUrl) {
  throw new Error("No browser screenshot metadata found in the rollout.");
}

const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
const target = resolve(outputPath);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, Buffer.from(encoded, "base64"));
console.log(target);

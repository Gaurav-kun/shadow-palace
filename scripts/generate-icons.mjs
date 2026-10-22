import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = join(root, "public", "icon.svg");
const pub = join(root, "public");

const sizes = [
  { out: "icon-192.png", size: 192 },
  { out: "icon-512.png", size: 512 },
  { out: "apple-touch-icon.png", size: 180 },
];

for (const { out, size } of sizes) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(pub, out));
  console.log(`✓ ${out}`);
}

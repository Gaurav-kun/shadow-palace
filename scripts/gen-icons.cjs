/* Regenerate PNG icons from icon.svg. Dev-only helper; gitignored via diag-*.cjs? No — name it gen-icons.mjs, run once, delete. */
const sharp = require("sharp");
const fs = require("fs");
const svg = fs.readFileSync("public/icon.svg");

(async () => {
  await sharp(svg, { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png");
  await sharp(svg, { density: 300 }).resize(192, 192).png().toFile("public/icon-192.png");
  // apple-touch-icon: iOS applies its own mask — full-bleed square, no rounded corners
  const flat = svg.toString().replace('rx="14"', 'rx="0"');
  await sharp(Buffer.from(flat), { density: 300 }).resize(180, 180).png().toFile("public/apple-touch-icon.png");
  console.log("PNGs regenerated: 512, 192, 180");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

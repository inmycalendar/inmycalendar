"use strict";
/* Renders assets/favicon.svg into the logo files, using librsvg via sharp.
   Deterministic: no browser, no copying base64 by hand. The previous attempt
   transferred a 22,000-character base64 string through a text channel, got a
   character wrong, and shipped a PNG whose header was valid and whose pixels
   were noise - which is why only a header check passed. */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/* Resolved from this file, not hardcoded: an absolute path from one machine
   both leaks a local folder layout into a public repo and makes the tool
   useless to anyone who clones it. */
const REPO = path.join(__dirname, "..");
const SVG  = fs.readFileSync(path.join(REPO, "assets/favicon.svg"));

/* The font in the SVG may not exist on this machine; librsvg would silently
   fall back and the wordmark would look different from the one on screen. So
   the text is replaced with the same shapes drawn as paths - identical on
   every machine, and what a logo file has to be. */
const OUT = [
  { file: "downloads/imc-logo-512-v2.png",  size: 512,  bg: null },
  { file: "downloads/imc-logo-1024-v2.png", size: 1024, bg: null },
  { file: "downloads/imc-logo-512-v2.jpg",  size: 512,  bg: "#ffffff", jpg: true },
  { file: "downloads/imc-logo-1024-v2.jpg", size: 1024, bg: "#ffffff", jpg: true },
  { file: "assets/icon-192-v2.png",         size: 192,  bg: "#ffffff" },
  { file: "assets/icon-512-v2.png",         size: 512,  bg: "#ffffff" },
  { file: "assets/apple-touch-icon-v2.png", size: 180,  bg: "#ffffff" }
];

(async () => {
  for (const o of OUT){
    let img = sharp(SVG, { density: 384 }).resize(o.size, o.size, {
      fit: "contain",
      background: o.bg ? o.bg : { r:0, g:0, b:0, alpha:0 }
    });
    if (o.bg) img = img.flatten({ background: o.bg });
    img = o.jpg ? img.jpeg({ quality: 95 }) : img.png({ compressionLevel: 9 });
    const buf = await img.toBuffer();
    fs.writeFileSync(path.join(REPO, o.file), buf);

    /* VERIFY THE PIXELS, not just the header. A logo that is blank or noise
       has a valid header too. Count how much ink is actually on the canvas. */
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let dark = 0, opaque = 0;
    for (let i = 0; i < data.length; i += 4){
      const a = data[i+3];
      if (a > 128) opaque++;
      if (a > 128 && data[i] < 80 && data[i+1] < 80 && data[i+2] < 80) dark++;
    }
    const total = info.width * info.height;
    console.log(
      o.file.padEnd(34) +
      String(buf.length).padStart(7) + " bytes  " +
      info.width + "x" + info.height +
      "  ink " + (dark * 100 / total).toFixed(1) + "%" +
      "  opaque " + (opaque * 100 / total).toFixed(1) + "%"
    );
    if (dark * 100 / total < 5) throw new Error("FAILED: " + o.file + " has almost no dark pixels - blank or corrupt");
  }
  console.log("\nall files written and pixel-checked");
})();

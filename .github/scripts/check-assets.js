/* Checks that what the live site serves matches what is committed.
   Run by .github/workflows/uptime.yml, and runnable by hand:

     node .github/scripts/check-assets.js

   WHY IT IS NOT JUST A HASH COMPARISON
   Hostinger re-encodes images. A PNG served from the site is not the PNG in
   this repository: it comes back with an added eXIf chunk and a recompressed
   IDAT, several kilobytes larger. Comparing bytes therefore reports every
   single image as stale, for ever, which is exactly the false alarm that sent
   me looking for a deploy bug that did not exist. Decoding the pixels of every
   icon on every run would be the thorough answer and is far too slow for a
   monitor, so images are checked by their dimensions instead: that catches a
   missing file, a truncated upload, or the wrong image at a given name, which
   is what actually goes wrong.

   Everything that is NOT an image is compared byte for byte. A fresh checkout
   on the runner is LF, like the server, so that comparison is valid there in a
   way it is not on a Windows working copy - which is the other false alarm
   this file exists to prevent anyone repeating. */

const { execSync } = require("child_process");
const https = require("https");

const SITE = "https://inmycalendar.com/";
const crypto = require("crypto");

const files = execSync(
  "git ls-files assets downloads manifest.webmanifest robots.txt", { encoding: "utf8" })
  .split("\n").map(s => s.trim())
  .filter(f => f && !f.startsWith("assets/holidays/"));

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve({ status: res.statusCode }); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: 200, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

const sha = b => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
const isImage = f => /\.(png|jpe?g)$/i.test(f);
const isText  = f => /\.(js|css|json|webmanifest|txt|xml|html|svg)$/i.test(f);

/* Line endings are normalised before hashing text. Git checks this repo out
   with CRLF on Windows and LF on the Linux server, so an un-normalised
   comparison calls every text file stale when run from a Windows machine -
   which it did, and which looked exactly like a broken deploy. A difference
   that is only \r is never the bug you are hunting. */
const norm = b => Buffer.from(b.toString("utf8").replace(/\r\n/g, "\n"), "utf8");

function pngSize(b) {
  if (b.length < 24 || b.slice(1, 4).toString() !== "PNG") return null;
  return b.readUInt32BE(16) + "x" + b.readUInt32BE(20);
}

(async () => {
  let bad = 0, checked = 0;
  for (const f of files) {
    let live;
    /* A unique query string per request. The CDN keys on the query, so this
       forces a MISS and a fetch from the origin. Without it the check can read
       a stale edge copy of a URL nobody actually requests - pages reference
       every asset as "?v=N" - and report a file as stale when the version the
       browser gets is correct. That happened, and cost a round of confusion. */
    const bust = SITE + f + "?nocache=" + Date.now() + "-" + Math.random().toString(36).slice(2);
    try { live = await get(bust); }
    catch (e) { console.log("ERROR    " + f + " -> " + e.message); bad++; continue; }

    if (live.status !== 200) { console.log("MISSING  " + f + " -> HTTP " + live.status); bad++; continue; }

    const local = require("fs").readFileSync(f);
    checked++;

    if (isImage(f)) {
      /* The host re-encodes these, so compare what it cannot silently change. */
      if (/\.png$/i.test(f)) {
        const a = pngSize(local), b = pngSize(live.body);
        if (!b) { console.log("CORRUPT  " + f + " -> the served file is not a valid PNG"); bad++; }
        else if (a !== b) { console.log("WRONG    " + f + " -> repo is " + a + ", server serves " + b); bad++; }
      } else if (live.body.length < 512) {
        console.log("TRUNCATED " + f + " -> only " + live.body.length + " bytes");
        bad++;
      }
      continue;
    }

    const a = isText(f) ? norm(local)     : local;
    const b = isText(f) ? norm(live.body) : live.body;
    if (sha(a) !== sha(b)) {
      console.log("STALE    " + f + " -> repo " + sha(a) + ", server " + sha(b));
      bad++;
    }
  }

  console.log((bad ? bad + " problem(s) in " : "ok    all ") + checked + " assets checked");
  process.exit(bad ? 1 : 0);
})();

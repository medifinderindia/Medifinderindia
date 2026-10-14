#!/bin/sh
# Run after every edit of ANY .js / .css file:   sh build.sh
# 1) rebuilds user.min.js / user.min.css from user.js / user.css
# 2) sets every  file.js?v=XXXX / file.css?v=XXXX  in EVERY .html page to a hash of that
#    file's content, so a changed file always gets a new URL and an unchanged file keeps its cache.
#    No manual version numbers anywhere (all pages always point to the same version of a file).
# Needs Node.js (first run downloads terser + clean-css automatically).
set -e
npx --yes terser user.js --compress --mangle -o user.min.js
npx --yes clean-css-cli -O1 --inline none -o user.min.css user.css
node - <<'JS'
const fs = require('fs'), c = require('crypto');
const hash = f => c.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
const re = /(?<=["'])([A-Za-z0-9_.\-]+\.(?:js|css))\?v=[A-Za-z0-9]+/g;
let touched = 0;
for (const p of fs.readdirSync('.').filter(f => f.endsWith('.html'))) {
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(re, (m, f) => fs.existsSync(f) ? f + '?v=' + hash(f) : m);
  if (after !== before) { fs.writeFileSync(p, after); touched++; }
}
console.log('versions updated in ' + touched + ' page(s)');
JS
echo "built + versioned: user.min.js user.min.css"

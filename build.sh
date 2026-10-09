#!/bin/sh
# Run after every edit of user.js / user.css:   sh build.sh
# (needs Node.js; first run downloads terser + clean-css automatically)
set -e
npx --yes terser user.js --compress --mangle -o user.min.js
npx --yes clean-css-cli -O1 --inline none -o user.min.css user.css
echo "built: user.min.js  user.min.css"
echo "now bump ?v= for them in user.html"

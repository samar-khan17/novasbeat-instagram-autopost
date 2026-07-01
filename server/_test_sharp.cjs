try { require("./node_modules/sharp/lib/sharp.js"); console.log("SHARP_OK"); } catch(e) { console.log("SHARP_FAIL:", e.message); } process.exit(0);

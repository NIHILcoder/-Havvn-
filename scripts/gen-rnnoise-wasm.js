// Regenerates electron/sharing/voice/rnnoise-wasm.ts from the @jitsi/rnnoise-wasm
// package's rnnoise.wasm, inlining it as a base64 string constant. Run after
// bumping the @jitsi/rnnoise-wasm devDependency:  node scripts/gen-rnnoise-wasm.js
//
// Why inline: the engine is compiled by tsc (no bundler) and packaged as
// files:["dist/**/*"], so a loose .wasm never reaches the app. A base64 const in a
// .ts rides the existing tsc -> dist pipeline with zero electron-builder changes.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@jitsi', 'rnnoise-wasm', 'dist', 'rnnoise.wasm');
const out = path.join(__dirname, '..', 'electron', 'sharing', 'voice', 'rnnoise-wasm.ts');

const b64 = fs.readFileSync(src).toString('base64');
const header =
  '// AUTO-GENERATED — do not edit by hand.\n' +
  '// RNNoise WASM (xiph/rnnoise via @jitsi/rnnoise-wasm, Apache-2.0), inlined as base64\n' +
  '// so it ships through the tsc -> dist pipeline (no loose .wasm, no electron-builder\n' +
  '// asset entry). Decoded in the engine window and handed to the AudioWorklet.\n' +
  '// Regenerate: node scripts/gen-rnnoise-wasm.js\n\n' +
  'export const RNNOISE_WASM_BASE64 =\n';
const lines = [];
for (let i = 0; i < b64.length; i += 120) lines.push("  '" + b64.slice(i, i + 120) + "'");
fs.writeFileSync(out, header + lines.join(' +\n') + ';\n');
console.log('wrote', path.relative(path.join(__dirname, '..'), out), '(' + b64.length + ' base64 chars)');

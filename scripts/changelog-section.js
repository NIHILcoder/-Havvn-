/**
 * Prints the CHANGELOG.md section for a version to stdout.
 *
 *   node scripts/changelog-section.js [version]
 *
 * Defaults to the package.json version. Exits 1 if the section is missing.
 * Used by the release workflow to build the GitHub release notes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version =
  process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const start = md.indexOf(`## [${version}]`);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version} — add "## [${version}] - YYYY-MM-DD" before releasing.`);
  process.exit(1);
}
const afterHeader = md.indexOf('\n', start) + 1;
const next = md.indexOf('\n## [', afterHeader);
process.stdout.write(md.slice(afterHeader, next === -1 ? undefined : next).trim() + '\n');

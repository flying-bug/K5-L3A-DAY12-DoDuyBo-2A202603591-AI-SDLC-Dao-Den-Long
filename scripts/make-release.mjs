// Build the runnable release archive: release/dao-den-long-v<version>.tar.gz
// It contains everything needed to play with only Node.js installed (three.js is bundled, no `npm install`):
//   tar -xzf dao-den-long-v1.0.0.tar.gz && cd dao-den-long-v1.0.0 && node scripts/serve.js
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `dao-den-long-v${pkg.version}`;
const outDir = path.join(root, 'release');
const stage = path.join(outDir, name);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const copy = (rel) => {
  const src = path.join(root, rel), dst = path.join(stage, rel);
  if (!fs.existsSync(src)) throw new Error(`missing ${rel} (run npm install first)`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};
for (const rel of ['web', 'src', 'scripts/serve.js', 'scripts/soak.mjs', 'scripts/soak-lib.mjs', 'scripts/bench.mjs',
  'node_modules/three/build/three.module.js', 'node_modules/three/LICENSE', 'game.contract.json', 'LICENSE', 'CREDITS.md', 'CHANGELOG.md']) copy(rel);
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', scripts: { start: 'node scripts/serve.js' } }, null, 2));
fs.writeFileSync(path.join(stage, 'RUN.md'), `# Đảo Đèn Lồng ${pkg.version}

Cần Node.js 18 trở lên (macOS, Linux hoặc Windows) và một trình duyệt hiện đại (Chrome, Edge, Firefox, Safari).

\`\`\`bash
node scripts/serve.js        # rồi mở http://localhost:8080
\`\`\`

Không cần \`npm install\`: three.js đã được đóng gói sẵn. Bảng xếp hạng lưu ở \`data/leaderboard.json\`.
Xuất bảng xếp hạng: \`node scripts/serve.js --export-leaderboard out.json\`.
`);

fs.mkdirSync(outDir, { recursive: true });
const archive = path.join(outDir, `${name}.tar.gz`);
fs.rmSync(archive, { force: true });
// relative paths + cwd: GNU tar on Windows would read a drive letter like E: as a remote host
const r = spawnSync('tar', ['-czf', `${name}.tar.gz`, name], { stdio: 'inherit', cwd: outDir });
if (r.status !== 0) { console.error('tar failed'); process.exit(1); }
console.log(`release: ${path.relative(root, archive)} (${Math.round(fs.statSync(archive).size / 1024)} KB)`);

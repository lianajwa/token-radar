// Token Radar's entrypoint (Node 22, standard library only).
//
// It reads the sealed snapshot, scores every pre-token protocol with the model in
// lib/radar.ts, writes the ranked board to /output/board.json and the dashboard's data to
// /output/data.js, copies this repository's dashboard/ and screenshots/ into /output, and
// writes /output/dossier.json with the vendored make.fun library last, so the scorer can
// rebuild the dossier from the same /output and compare bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** This file's own directory, so the program works from any working directory. */
const home = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_CAP = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read one `--flag value` or `--flag=value` argument, else the fallback. */
function readArg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]!;
  const glued = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return glued === undefined ? fallback : glued.slice(flag.length + 3);
}

const inputArg = readArg('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = readArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `dest`, skipping dot-names, and report what copied. */
function copyTree(src: string, dest: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dest, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(src)) {
    if (name.startsWith('.')) continue;
    const from = join(src, name);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(dest, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyTree(join(home, 'dashboard'), join(outDir, 'dashboard'));
const shotFiles = copyTree(join(home, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shotFiles.length} image${shotFiles.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shotFiles) {
  if (!PLAIN_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: TEXT_CAP, screenshots: SHOT_CAP, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashFiles.length} files), ${join(outDir, 'screenshots')} (${shotFiles.length} images) and ${join(outDir, 'dossier.json')}\n`,
);

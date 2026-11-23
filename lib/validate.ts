// Recompute the model's validation numbers from a snapshot and check them
// against the constants baked into lib/model.ts. Run:
//   node lib/validate.ts --input <snapshot.json>
// Exit 0 when every recomputed figure matches the baked constant within
// tolerance; exit 1 otherwise. No network, no clock: fully deterministic.
import { readFileSync } from 'node:fs';
import { COMPS, ODDS, VALIDATION, ageDays, isPreToken, parseSnapshot, tokenOdds } from './model.ts';

const input = (() => {
  const at = process.argv.indexOf('--input');
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : '/input/snapshot.json';
})();

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  return solve(XtX, Xty);
}

const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
const feat = (p: { tvl_usd: number }): number[] => [1, Math.log(p.tvl_usd)];
const y = train.map((p) => Math.log(p.mcap_usd!));

const beta = ols(train.map(feat), y);
const mean = y.reduce((a, b) => a + b, 0) / y.length;

// Leave-one-out.
let ssRes = 0;
let ssTot = 0;
const apes: number[] = [];
const within: boolean[] = [];
for (let i = 0; i < train.length; i++) {
  const sub = train.filter((_, j) => j !== i);
  const b = ols(sub.map(feat), sub.map((p) => Math.log(p.mcap_usd!)));
  const pr = feat(train[i]!).reduce((s, v, k) => s + v * b[k]!, 0);
  ssRes += (y[i]! - pr) ** 2;
  ssTot += (y[i]! - mean) ** 2;
  apes.push(Math.abs(Math.exp(pr) - train[i]!.mcap_usd!) / train[i]!.mcap_usd!);
  within.push(Math.abs(pr - y[i]!) < Math.log(2));
}
const looR2 = 1 - ssRes / ssTot;
const looApe = median(apes) * 100;
const looWithin = (within.filter(Boolean).length / within.length) * 100;

// Walk-forward: listed before 2025-01-01 trains, listed after tests.
const cut = Date.parse('2025-01-01T00:00:00Z');
const tr = train.filter((p) => p.listed_at && Date.parse(`${p.listed_at}T00:00:00Z`) < cut);
const te = train.filter((p) => p.listed_at && Date.parse(`${p.listed_at}T00:00:00Z`) >= cut);
const wBeta = ols(tr.map(feat), tr.map((p) => Math.log(p.mcap_usd!)));
const yte = te.map((p) => Math.log(p.mcap_usd!));
const yteMean = yte.reduce((a, b) => a + b, 0) / yte.length;
let wRes = 0;
let wTot = 0;
const wApes: number[] = [];
te.forEach((p, i) => {
  const pr = feat(p).reduce((s, v, k) => s + v * wBeta[k]!, 0);
  wRes += (yte[i]! - pr) ** 2;
  wTot += (yte[i]! - yteMean) ** 2;
  wApes.push(Math.abs(Math.exp(pr) - p.mcap_usd!) / p.mcap_usd!);
});
const wfR2 = 1 - wRes / wTot;
const wfApe = median(wApes) * 100;

// Starter formula, same leave-one-out folds (it has no fit, so in-sample = LOO).
const starterImplied = (p: { tvl_usd: number; change_7d: number | null; listed_at: string | null }): number => {
  const g = clamp(p.change_7d ?? 0, -60, 120);
  const gm = 1 + (g / 100) * 0.5;
  const age = ageDays(snapshot.as_of, p.listed_at) ?? 365;
  const mm = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
  return Math.max(1, Math.round(p.tvl_usd * 0.25 * gm * mm));
};
let sRes = 0;
let sTot = 0;
const sApes: number[] = [];
train.forEach((p, i) => {
  const pr = Math.log(starterImplied(p));
  sRes += (y[i]! - pr) ** 2;
  sTot += (y[i]! - mean) ** 2;
  sApes.push(Math.abs(starterImplied(p) - p.mcap_usd!) / p.mcap_usd!);
});
const starterR2 = 1 - sRes / sTot;
const starterApe = median(sApes) * 100;

// Token-odds calibration: mean predicted rate vs actual rate on all 758.
const all = snapshot.protocols.filter((p) => p.tvl_usd > 0);
const meanPred = all.reduce((s, p) => s + tokenOdds(p, snapshot.as_of), 0) / all.length;
const actualRate = all.filter((p) => !isPreToken(p)).length / all.length;

const close = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const checks: Array<[string, boolean, string]> = [
  ['fit intercept', close(beta[0]!, COMPS.intercept, 0.01), `${beta[0]!.toFixed(3)} vs baked ${COMPS.intercept}`],
  ['fit elasticity', close(beta[1]!, COMPS.tvlElasticity, 0.01), `${beta[1]!.toFixed(3)} vs baked ${COMPS.tvlElasticity}`],
  ['training n', train.length === COMPS.trainingN, `${train.length} vs baked ${COMPS.trainingN}`],
  ['LOO R2', close(looR2, VALIDATION.looR2, 0.01), `${looR2.toFixed(3)} vs baked ${VALIDATION.looR2}`],
  ['LOO median APE %', close(looApe, VALIDATION.looMedianApePct, 0.5), `${looApe.toFixed(1)} vs baked ${VALIDATION.looMedianApePct}`],
  ['LOO within 2x %', close(looWithin, VALIDATION.looWithin2xPct, 1), `${looWithin.toFixed(1)} vs baked ${VALIDATION.looWithin2xPct}`],
  ['walk-forward R2', close(wfR2, VALIDATION.walkForwardR2, 0.01), `${wfR2.toFixed(3)} vs baked ${VALIDATION.walkForwardR2}`],
  ['walk-forward median APE %', close(wfApe, VALIDATION.walkForwardMedianApePct, 0.5), `${wfApe.toFixed(1)} vs baked ${VALIDATION.walkForwardMedianApePct}`],
  ['walk-forward train n', tr.length === VALIDATION.walkForwardTrainN, `${tr.length} vs baked ${VALIDATION.walkForwardTrainN}`],
  ['walk-forward test n', te.length === VALIDATION.walkForwardTestN, `${te.length} vs baked ${VALIDATION.walkForwardTestN}`],
  ['starter LOO R2', close(starterR2, VALIDATION.starterLooR2, 0.01), `${starterR2.toFixed(3)} vs baked ${VALIDATION.starterLooR2}`],
  ['starter median APE %', close(starterApe, VALIDATION.starterMedianApePct, 0.5), `${starterApe.toFixed(1)} vs baked ${VALIDATION.starterMedianApePct}`],
  ['odds calibration', close(meanPred, actualRate, 0.01), `mean predicted ${meanPred.toFixed(3)} vs actual ${actualRate.toFixed(3)}`],
];
let failed = 0;
for (const [name, ok, detail] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}\n`);
  if (!ok) failed++;
}
process.stdout.write(`validate: ${checks.length - failed}/${checks.length} checks passed (snapshot as_of ${snapshot.as_of}, training n=${train.length})\n`);
process.exit(failed === 0 ? 0 : 1);

// Token Radar — comps model for token-radar-01 (written from scratch for this entry).
//
// The board ranks every pre-token protocol the radar can score: the snapshot's
// 40-protocol watchlist plus every rankable pre-token protocol below the $50M
// floor (186 more), 226 rows in all. Protocols recorded as CEX products or as
// versioned pools of another protocol are left out: they are not standalone
// protocols waiting on a token. Live-token protocols are kept apart and shown
// at the market's own value, never mixed into the ranking.
//
// Implied value is a fitted power law in TVL — the one relationship in this
// snapshot that survives out-of-sample testing:
//
//   log(mcap) = 6.965 + 0.522 * log(TVL)          (OLS, n = 128, see below)
//   implied   = max(1, round(exp(6.965) * TVL^0.522))
//
// Growth and age were tested as extra regressors and DROPPED: they lower the
// leave-one-out R^2 (0.170 -> 0.143) and collapse the walk-forward test
// (R^2 -0.24 -> -1.58), and their fitted signs flip between the low- and
// high-TVL halves of the training set. The dashboard still shows each row's
// 7-day growth and age, age drives the token-odds model, and age sets the
// farm plan's hold time — but neither is allowed to move the implied value
// when the data says they do not predict it. See lib/validate.ts to
// recompute every number below from the sealed snapshot.
//
// Validation (snapshot as_of 2026-11-14, training set = 128 protocols with a
// recorded market cap; recompute with `node lib/validate.ts --input <snapshot>`):
//   LOO            R^2 = 0.170, median APE 85.4%, 32% of predictions within 2x
//   Walk-forward    R^2 = -0.235, median APE 89.2% (train: listed before
//                    2025-01-01, n = 64; test: listed after, n = 31) — the
//                    mcap/TVL relation shifted for the 2025 cohort, so the
//                    board states the honest, weak validation instead of
//                    hiding it.
//   Starter formula (TVL x 0.25 x growth x maturity): LOO R^2 = 0.018,
//                    median APE 88.6% — the fitted power law beats it on
//                    every metric, mostly by fixing its systematic scale.
//
// Token odds are a logistic regression on all 758 protocols (has-token vs
// not): log-odds = 0.114 + 0.048*z(log TVL) + 0.648*z(log age) + 0.687*Lending.
// Mean predicted rate 0.548 vs actual 0.549. It is a historical peer rate,
// never a prediction that a token will be issued.
//
// Farm EV assumes a farmer captures 0.002% of implied value — the story is
// 5% of the implied value distributed to 2,500 active farmers — minus the
// real gas cost of farming that chain for the plan's hold time:
//   EV = implied * odds * 0.00002 - farmCost
//   FARM     when EV > $50 and gas is under 25% of the gross share
//   MARGINAL when EV is $10-$50, or gas is 25-60% of the gross share
//   SKIP     otherwise. On this snapshot: 94 FARM / 103 MARGINAL / 29 SKIP.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Fitted comps regression: log(mcap) = intercept + elasticity * log(TVL). */
export const COMPS = {
  intercept: 6.965,
  tvlElasticity: 0.522,
  trainingN: 128,
  modelVersion: 'comps-powlaw-1',
} as const;

/** Out-of-sample validation, measured on the sealed snapshot (see lib/validate.ts). */
export const VALIDATION = {
  looR2: 0.17,
  looMedianApePct: 85.4,
  looWithin2xPct: 32,
  walkForwardR2: -0.235,
  walkForwardMedianApePct: 89.2,
  walkForwardTrainN: 64,
  walkForwardTestN: 31,
  starterLooR2: 0.018,
  starterMedianApePct: 88.6,
} as const;

/** Token-odds logistic regression (all 758 protocols, has-token vs not). */
export const ODDS = {
  intercept: 0.1139,
  tvl: 0.0479,
  age: 0.6477,
  lending: 0.6872,
  muLogTvl: 17.735,
  sdLogTvl: 1.808,
  muLogAge: 6.365,
  sdLogAge: 0.979,
  /** Median age in days of the training set; the fallback when listed_at is null. */
  medianAgeDays: 1000,
} as const;

/** Share of implied value one farmer is assumed to capture (5% / 2,500 farmers). */
export const ALLOC_FRAC = 0.00002;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  farm_cost_usd: number;
  ev_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  model: {
    logTvl: number;
    implied_value_usd: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan as written in board.json. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  token_odds: number;
  farm_cost_usd: number;
  ev_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  hold_days: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model behind it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: {
    name: string;
    formula: string;
    intercept: number;
    tvlElasticity: number;
    trainingN: number;
    version: string;
  };
  validation: typeof VALIDATION;
  oddsNote: string;
  allocNote: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  verdicts: { FARM: number; MARGINAL: number; SKIP: number };
  median_ev_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The fitted implied value for one protocol: the comps power law in TVL. */
export function impliedValue(p: SnapshotProtocol): number {
  return Math.max(1, Math.round(Math.exp(COMPS.intercept + COMPS.tvlElasticity * Math.log(p.tvl_usd))));
}

/** A protocol's token odds: the historical peer rate that a protocol of this age and size records a token. */
export function tokenOdds(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at) ?? ODDS.medianAgeDays;
  const zTvl = (Math.log(p.tvl_usd) - ODDS.muLogTvl) / ODDS.sdLogTvl;
  const zAge = (Math.log(Math.max(age, 1)) - ODDS.muLogAge) / ODDS.sdLogAge;
  const lending = (p.category ?? '').toLowerCase().includes('lend') ? 1 : 0;
  const z = ODDS.intercept + ODDS.tvl * zTvl + ODDS.age * zAge + ODDS.lending * lending;
  const clamped = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-clamped));
}

/** Gas to farm one chain: [setup cost, weekly cost] in dollars, from typical mainnet/L2 fees. */
const GAS: Record<string, [number, number]> = {
  Ethereum: [12, 4],
  Arbitrum: [2, 0.5],
  Optimism: [2, 0.5],
  Base: [2, 0.5],
  Solana: [1, 0.1],
  BSC: [3, 1],
  Polygon: [3, 1],
  Avalanche: [3, 1],
};
const GAS_DEFAULT: [number, number] = [4, 1];

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas bill for farming this protocol on its first chain for the hold time. */
export function farmCost(p: SnapshotProtocol, asOf: string): { costUsd: number; setupUsd: number; weeklyUsd: number; weeks: number } {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  const [setup, weekly] = GAS[chain] ?? GAS_DEFAULT;
  const weeks = Math.max(1, Math.round(holdDaysFor(ageDays(asOf, p.listed_at)) / 7));
  return { costUsd: Math.max(1, Math.round(setup + weekly * weeks)), setupUsd: setup, weeklyUsd: weekly, weeks };
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC into ${name}'s lending market on ${chain} and leave it supplied.`;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity')) return `Add $${capital} of liquidity to the main ${name} pool on ${chain} and hold the LP position.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} onto ${chain} and put it to work in the app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} through ${name} on ${chain} and hold the staking receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as collateral on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a ${name} market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${capital} to a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, asOf: string): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p);
  const age = ageDays(asOf, p.listed_at);
  const hold = holdDaysFor(age);
  const gas = farmCost(p, asOf);
  return [
    {
      text: `Set up a new wallet used only for this farm, funded with just the capital below, and store its recovery phrase offline.`,
      cost: `about $${gas.setupUsd} of gas to fund it`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas.setupUsd} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet stays active.`,
      cost: `about $${gas.weeklyUsd} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity spans more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own points or rewards page before withdrawing, and claim only through the link that page publishes.`,
      cost: 'free to check; never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Record the wallet, the dates and every transaction in a farm log so the position can be repeated or unwound.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** FARM / MARGINAL / SKIP from the expected value net of the gas bill. */
export function verdictFor(grossUsd: number, costUsd: number): { verdict: 'FARM' | 'MARGINAL' | 'SKIP'; evUsd: number } {
  const ev = Math.round(grossUsd - costUsd);
  if (ev > 50 && costUsd < 0.25 * grossUsd) return { verdict: 'FARM', evUsd: ev };
  if (ev >= 10 && costUsd <= 0.6 * grossUsd) return { verdict: 'MARGINAL', evUsd: ev };
  return { verdict: 'SKIP', evUsd: ev };
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is on the board.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the floor.
  // No cap and no TVL cut beyond the floor: this is the full census.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const implied = impliedValue(p);
    const odds = tokenOdds(p, snapshot.as_of);
    const gas = farmCost(p, snapshot.as_of);
    const gross = implied * odds * ALLOC_FRAC;
    const { verdict, evUsd } = verdictFor(gross, gas.costUsd);
    return { p, implied, odds, gas, verdict, evUsd };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    age_days: ageDays(snapshot.as_of, s.p.listed_at),
    implied_value_usd: s.implied,
    token_odds: Math.round(s.odds * 10000) / 10000,
    farm_cost_usd: s.gas.costUsd,
    ev_usd: s.evUsd,
    verdict: s.verdict,
    model: {
      logTvl: Math.round(Math.log(s.p.tvl_usd) * 10000) / 10000,
      implied_value_usd: s.implied,
    },
    farm_steps: farmSteps(s.p, snapshot.as_of).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with its farm plan as written in board.json. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    token_odds: row.token_odds,
    farm_cost_usd: row.farm_cost_usd,
    ev_usd: row.ev_usd,
    verdict: row.verdict,
    hold_days: holdDaysFor(row.age_days),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdicts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const r of board) verdicts[r.verdict]++;
  const evs = board.map((r) => r.ev_usd).sort((a, b) => a - b);
  const medianEv = evs.length % 2 ? evs[(evs.length - 1) / 2]! : Math.round((evs[evs.length / 2 - 1]! + evs[evs.length / 2]!) / 2);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      name: 'comps power law in TVL',
      formula: 'implied = exp(6.965) * TVL^0.522',
      intercept: COMPS.intercept,
      tvlElasticity: COMPS.tvlElasticity,
      trainingN: COMPS.trainingN,
      version: COMPS.modelVersion,
    },
    validation: VALIDATION,
    oddsNote: 'Token odds are the historical peer rate that a protocol of this age and size records a token (logistic fit on all 758 protocols). A peer rate is not a prediction that a token will be issued.',
    allocNote: 'EV assumes a farmer captures 0.002% of implied value (5% of implied value distributed to 2,500 active farmers) minus the gas cost of farming that chain for the plan hold time.',
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    verdicts,
    median_ev_usd: medianEv,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

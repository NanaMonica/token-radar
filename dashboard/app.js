// Token Radar dashboard: renders window.RADAR (written by main.ts as data.js).
// No network, no fetch: everything on this page comes from that one script.
(function () {
  'use strict';
  var R = window.RADAR;
  var root = document.getElementById('board');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    if (n == null) return '—';
    var sign = n < 0 ? '−$' : '$';
    return sign + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageLabel(d) {
    if (d == null) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }

  var state = {
    tab: 'board',
    sortKey: 'rank',
    sortDir: 1,
    q: '',
    cat: '',
    chain: '',
    verdict: '',
    watchlistOnly: false,
    farmOnly: false,
    selected: null,
  };

  var cats = [];
  var chains = [];
  (function () {
    var cs = {}, hs = {};
    R.rows.forEach(function (r) {
      if (r.category) cs[r.category] = 1;
      (r.chains || []).forEach(function (c) { hs[c] = 1; });
    });
    cats = Object.keys(cs).sort();
    chains = Object.keys(hs).sort();
  })();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && R.watchlist.indexOf(r.slug) < 0) return false;
      if (state.farmOnly && r.verdict !== 'FARM') return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir;
    rows.sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return rows;
  }

  function kpiHtml() {
    var v = R.validation;
    var kpis = [
      [String(R.board_size), 'rows on the board'],
      [R.watchlist_size + '/40', 'watchlist covered'],
      [R.verdicts.FARM + ' FARM', R.verdicts.MARGINAL + ' marginal · ' + R.verdicts.SKIP + ' skip'],
      [usdFull(R.median_ev_usd), 'median farm EV'],
      ['R² ' + v.looR2.toFixed(2), 'leave-one-out, n=' + R.model.trainingN],
      ['MAPE ' + v.looMedianApePct.toFixed(0) + '%', 'leave-one-out median error'],
    ];
    return '<div class="kpis">' + kpis.map(function (k) {
      return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function tableHtml(rows) {
    var cols = [
      ['rank', 'Rank', 'num'],
      ['name', 'Protocol', ''],
      ['category', 'Category', ''],
      ['chains', 'Chain', ''],
      ['tvl_usd', 'TVL', 'num'],
      ['change_7d', '7d', 'num'],
      ['age_days', 'Age', 'num'],
      ['implied_value_usd', 'Implied value', 'num'],
      ['token_odds', 'Token odds', 'num'],
      ['ev_usd', 'EV', 'num'],
      ['verdict', 'Verdict', ''],
    ];
    var head = '<tr>' + cols.map(function (c) {
      var arrow = state.sortKey === c[0] ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      return '<th class="' + c[2] + '"><button data-sort="' + c[0] + '">' + c[1] + arrow + '</button></th>';
    }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc((r.chains || [])[0] || '—') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageLabel(r.age_days) + '</td>' +
        '<td class="num">' + usd(r.implied_value_usd) + '</td>' +
        '<td class="num">' + (r.token_odds * 100).toFixed(0) + '%</td>' +
        '<td class="num">' + usdFull(r.ev_usd) + '</td>' +
        '<td><span class="tag ' + r.verdict + '">' + r.verdict + '</span></td>' +
        '</tr>';
    }).join('');
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function detailHtml(r) {
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<section class="detail"><h2>#' + r.rank + ' ' + esc(r.name) + ' <span class="tag ' + r.verdict + '">' + r.verdict + '</span></h2>' +
      '<div>' + esc(r.category || 'Uncategorised') + ' · ' + esc((r.chains || []).join(', ') || '—') + '</div>' +
      '<div class="grid">' +
      '<div>TVL<br><b>' + usdFull(r.tvl_usd) + '</b></div>' +
      '<div>7-day change<br><b>' + pct(r.change_7d) + '</b></div>' +
      '<div>Age<br><b>' + ageLabel(r.age_days) + (r.age_days == null ? ' (age unknown — median used for odds)' : '') + '</b></div>' +
      '<div>Implied value<br><b>' + usdFull(r.implied_value_usd) + '</b></div>' +
      '<div>Token odds (peer rate)<br><b>' + (r.token_odds * 100).toFixed(1) + '%</b></div>' +
      '<div>Farm gas cost<br><b>' + usdFull(r.farm_cost_usd) + '</b></div>' +
      '<div>Expected value<br><b>' + usdFull(r.ev_usd) + '</b></div>' +
      '<div>Hold time<br><b>' + r.hold_days + ' days</b></div>' +
      '</div>' +
      '<p>Model: implied = exp(' + R.model.intercept + ') × TVL^' + R.model.tvlElasticity +
      ' — the comps power law fitted on ' + R.model.trainingN + ' tokenized protocols. ' +
      'Token odds are the historical peer rate for a protocol of this age and size, not a prediction that a token will be issued.</p>' +
      '<h3>Farm plan — 6 steps</h3><ol>' + steps + '</ol>' +
      '<p>Total: about ' + usdFull(r.farm_cost_usd) + ' of gas over ' + r.hold_days + ' days, plus the capital in step 2 which stays yours. Claim only through links the protocol itself publishes; never pay to claim.</p>' +
      '</section>';
  }

  function liveHtml() {
    var rows = R.live.map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td>' +
        '<td>' + esc((p.chains || [])[0] || '—') + '</td>' +
        '<td class="num">' + usd(p.tvl_usd) + '</td>' +
        '<td class="num">' + usd(p.mcap_usd) + '</td>' +
        '<td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
    return '<p>These protocols already trade — the board shows the market\u2019s own value for them, not a model. They are not ranked by the radar.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Category</th><th>Chain</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function integrityHtml() {
    var tests = [];
    var slugs = {};
    var covered = R.watchlist.every(function (s) { return R.rows.some(function (r) { return r.slug === s; }); });
    tests.push(['watchlist coverage ' + R.watchlist_size + '/' + R.watchlist.length, covered]);
    var ranksOk = R.rows.every(function (r, i) { return r.rank === i + 1; }) && R.rows.length === new Set(R.rows.map(function (r) { return r.rank; })).size;
    tests.push(['ranks 1..' + R.rows.length + ' unique', ranksOk]);
    var mono = true;
    for (var i = 1; i < R.rows.length; i++) if (R.rows[i].implied_value_usd > R.rows[i - 1].implied_value_usd) mono = false;
    tests.push(['implied value never rises with rank', mono]);
    var stepsOk = R.rows.every(function (r) {
      return r.farm_steps.length >= 3 && r.farm_steps.length <= 12 &&
        r.farm_steps.every(function (s) { return s.length >= 20 && s.length <= 600; });
    });
    tests.push(['farm steps 3–12 per row, 20–600 chars', stepsOk]);
    var extLinks = document.querySelectorAll('a[href^="http"]').length;
    tests.push(['no external links on the page', extLinks === 0]);
    var countsOk = R.rows.filter(function (r) { return r.verdict === 'FARM'; }).length === R.verdicts.FARM &&
      R.rows.filter(function (r) { return r.verdict === 'MARGINAL'; }).length === R.verdicts.MARGINAL &&
      R.rows.filter(function (r) { return r.verdict === 'SKIP'; }).length === R.verdicts.SKIP;
    tests.push(['verdict counts match the board', countsOk]);
    return '<section class="integrity">self-test — ' + tests.map(function (t) {
      return '<span class="' + (t[1] ? 'pass' : 'fail') + '">' + (t[1] ? 'PASS' : 'FAIL') + '</span> ' + esc(t[0]);
    }).join('<br>') + '</section>';
  }

  function methodHtml() {
    var v = R.validation;
    return '<section class="method"><h2>Methodology</h2>' +
      '<p>Model: <code>' + esc(R.model.formula) + '</code> — a log-log comps regression fitted on ' + R.model.trainingN +
      ' protocols with a recorded market cap (snapshot as of ' + esc(R.as_of) + ', source: DefiLlama). ' +
      'Growth and age were tested as extra regressors and dropped: they lower the leave-one-out R² and collapse the walk-forward test, so the data says they do not predict value.</p>' +
      '<p>Validation: leave-one-out R² ' + v.looR2.toFixed(3) + ', median error ' + v.looMedianApePct.toFixed(1) + '%, ' + v.looWithin2xPct +
      '% of predictions within 2x; walk-forward R² ' + v.walkForwardR2.toFixed(3) + ', median error ' + v.walkForwardMedianApePct.toFixed(1) +
      '% (trained on protocols listed before 2025-01-01, n=' + v.walkForwardTrainN + '; tested after, n=' + v.walkForwardTestN +
      '). The starter formula scores LOO R² ' + v.starterLooR2.toFixed(3) + ' on the same folds. The model is weak and the board says so — recompute it with <code>node lib/validate.ts</code>.</p>' +
      '<p>' + esc(R.oddsNote) + '</p>' +
      '<p>' + esc(R.allocNote) + '</p>' +
      '<p>Implied value is this entry\u2019s own claim, never a prediction that a token will be issued. Farm at your own risk; claim only through links the protocol itself publishes.</p>' +
      '</section>';
  }

  function render() {
    var rows = filteredRows();
    var selected = state.selected ? R.rows.find(function (r) { return r.slug === state.selected; }) : null;
    var html = '<h1>Token Radar</h1>' +
      '<p class="sub">Pre-token protocols ranked by the implied value of a token they may one day issue. Snapshot ' + esc(R.as_of) + ' · ' + R.board_size + ' rows · Source: DefiLlama</p>' +
      kpiHtml() +
      '<div class="tabs"><button data-tab="board" aria-selected="' + (state.tab === 'board') + '">Board</button>' +
      '<button data-tab="live" aria-selected="' + (state.tab === 'live') + '">Live tokens (' + R.live_size + ')</button></div>';
    if (state.tab === 'board') {
      html += '<div class="filters">' +
        '<input type="search" id="q" placeholder="Search name or slug" value="' + esc(state.q) + '" aria-label="Search">' +
        '<select id="f-cat" aria-label="Category"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<select id="f-chain" aria-label="Chain"><option value="">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<select id="f-verdict" aria-label="Verdict"><option value="">All verdicts</option>' + ['FARM', 'MARGINAL', 'SKIP'].map(function (v) { return '<option' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
        '<label><input type="checkbox" id="f-wl"' + (state.watchlistOnly ? ' checked' : '') + '> Watchlist only</label>' +
        '<label><input type="checkbox" id="f-farm"' + (state.farmOnly ? ' checked' : '') + '> FARM only</label>' +
        '<button class="btn" id="csv">Download CSV</button>' +
        '<span class="count">' + rows.length + ' of ' + R.rows.length + ' rows</span></div>';
      if (selected) html += detailHtml(selected);
      html += tableHtml(rows);
    } else {
      html += liveHtml();
    }
    html += integrityHtml() + methodHtml();
    root.innerHTML = html;
    root.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    root.querySelectorAll('[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = k === 'rank' ? 1 : -1; }
        render();
      });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); });
    var fc = document.getElementById('f-cat');
    if (fc) fc.addEventListener('change', function () { state.cat = fc.value; render(); });
    var fh = document.getElementById('f-chain');
    if (fh) fh.addEventListener('change', function () { state.chain = fh.value; render(); });
    var fv = document.getElementById('f-verdict');
    if (fv) fv.addEventListener('change', function () { state.verdict = fv.value; render(); });
    var fw = document.getElementById('f-wl');
    if (fw) fw.addEventListener('change', function () { state.watchlistOnly = fw.checked; render(); });
    var ff = document.getElementById('f-farm');
    if (ff) ff.addEventListener('change', function () { state.farmOnly = ff.checked; render(); });
    var csv = document.getElementById('csv');
    if (csv) csv.addEventListener('click', downloadCsv);
    root.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.selected = state.selected === tr.getAttribute('data-slug') ? null : tr.getAttribute('data-slug');
        render();
        var d = root.querySelector('.detail');
        if (d) d.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  function downloadCsv() {
    var head = 'rank,slug,name,category,chain,tvl_usd,change_7d,age_days,implied_value_usd,token_odds,farm_cost_usd,ev_usd,verdict';
    var lines = filteredRows().map(function (r) {
      var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      return [r.rank, r.slug, q(r.name), q(r.category || ''), q((r.chains || [])[0] || ''), r.tvl_usd, r.change_7d == null ? '' : r.change_7d, r.age_days == null ? '' : r.age_days, r.implied_value_usd, r.token_odds, r.farm_cost_usd, r.ev_usd, r.verdict].join(',');
    });
    var blob = new Blob([head + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  render();
})();

// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the board, the filters, the live-token view and a per-protocol detail panel
// with the model's own arithmetic and the protocol's farm plan. No network: every byte it
// shows is in data.js. The page recomputes each row's implied value from the snapshot
// figures, so the code and board.json can be checked against each other.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('board-panel');
  if (!DATA || !root) return;

  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, recomputed in the page from the same constants data.js carries: comparables
  // multiple, growth, the maturity bell and chain breadth. Same arithmetic as lib/radar.ts.
  function modelOf(row) {
    var m = DATA.model;
    var growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growthPct / 100) * m.growth_weight;
    var age = row.age_days === null ? m.unknown_age_days : row.age_days;
    var z = (age - m.maturity_peak_days) / m.maturity_spread_days;
    var maturityMult = m.maturity_floor + (1 - m.maturity_floor) * Math.exp(-(z * z));
    var chainMult = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_steps) * m.chain_step;
    var implied = Math.max(1, Math.round(row.tvl_usd * row.comparable_multiple * growthMult * maturityMult * chainMult));
    return { growthPct: growthPct, growthMult: growthMult, maturityMult: maturityMult, chainMult: chainMult, implied: implied };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased, so the plan the page shows is the plan the board carries.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function mainAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + p.name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + p.name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + p.name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + p.name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + p.name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + p.name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + p.name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + p.name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + p.name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + p.name + "'s basis position on " + chain + ' and hold it through one funding cycle.';
    if (c.indexOf('privacy') >= 0) return 'Use $' + capital + ' through ' + p.name + "'s private flow on " + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }
  function extraSignal(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Swap the same pair back once a week so the router records repeat flow, not one deposit.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply once, then repay it, to register borrower activity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back on a second chain so both directions are seen.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a second small stake after the first epoch to show ongoing use.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge and open a fresh one once to show repeat use.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and enter another to show repeat participation.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move a small amount between two of its vaults to show allocator activity.';
    if (c.indexOf('stable') >= 0) return 'Hold the stable asset through one rebalance or redemption window.';
    if (c.indexOf('rwa') >= 0) return 'Top the position up once after the first yield distribution lands.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the cover once before it lapses.';
    if (c.indexOf('basis') >= 0) return 'Hold the basis position through a second funding cycle.';
    return 'Repeat the main action once after two weeks so the activity is not a single touch.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s += ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: mainAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: extraSignal(p), cost: 'about $2 of gas', time: '10 minutes' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // -- state from the hash, so a board, a filter and a protocol all have a link --------------
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // -- the filtered, sorted board --------------------------------------------------------
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // -- small pieces ----------------------------------------------------------------------
  function sortButton(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + esc(label) + esc(arrow) + '</button></th>';
  }
  function growthCell(r) {
    if (r.change_7d === null) return '<td class="num">n/a</td>';
    return '<td class="num ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + esc(fmtPct(r.change_7d)) + '</td>';
  }
  function chainList(r) {
    return esc((r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain'));
  }

  // -- the board table -------------------------------------------------------------------
  function boardTable() {
    var list = sortedRows(visibleRows());
    var count = document.getElementById('row-count');
    if (count) count.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      return '<div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button type="button" id="clear-filters">Clear filters</button></div>';
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var rowsHtml = list.map(function (r) {
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var pill = r.on_watchlist ? '<span class="pill watch">watchlist</span>' : '<span class="pill">early</span>';
      return '<tr data-slug="' + esc(r.slug) + '" data-open="' + (state.selected === r.slug) + '" tabindex="0">'
        + '<td class="rank-cell">' + r.rank + '</td>'
        + '<td><div class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + chainList(r) + '</span></div></td>'
        + '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>'
        + growthCell(r)
        + '<td class="num">' + esc(fmtAge(r.age_days)) + '</td>'
        + '<td><div class="implied-cell"><span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span><span class="num">' + esc(fmtUsd(r.implied_value_usd)) + '</span></div></td>'
        + '<td>' + pill + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table>'
      + '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>'
      + '<thead><tr>' + sortButton('implied', 'Rank') + sortButton('name', 'Protocol') + sortButton('tvl', 'TVL') + sortButton('growth', '7d') + sortButton('age', 'Age') + sortButton('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // -- the live-token view ----------------------------------------------------------------
  function liveTable() {
    var count = document.getElementById('row-count');
    if (count) count.textContent = DATA.live.length + ' live-token protocols';
    var rowsHtml = DATA.live.map(function (r) {
      return '<tr><td class="num">live</td>'
        + '<td><div class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + chainList(r) + '</span></div></td>'
        + '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>'
        + growthCell(r)
        + '<td class="num">' + esc(fmtUsd(r.mcap_usd)) + '</td>'
        + '<td><span class="pill live">already trades</span></td></tr>';
    }).join('');
    return '<div class="table-wrap"><table>'
      + '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>'
      + '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // -- header, hero, spotlight, model -----------------------------------------------------
  function renderChrome() {
    var meta = document.getElementById('mast-meta');
    if (meta) meta.innerHTML = '<span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>DefiLlama protocol index</span><span>Model <b>' + esc(DATA.model_version) + '</b></span>';
    var title = document.getElementById('hero-title');
    if (title) title.textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    var lede = document.getElementById('hero-lede');
    if (lede) {
      lede.innerHTML = 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> of TVL and no token on record. '
        + 'The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor, and the board separates them from the '
        + '<b>' + DATA.live_size + ' live-token protocols</b> set aside with their market caps. Implied value is a model, not a promise.';
    }
    var stats = document.getElementById('stat-grid');
    if (stats) {
      stats.innerHTML = '<div class="stat"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>'
        + '<div class="stat"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>'
        + '<div class="stat"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>'
        + '<div class="stat"><span>Market multiple, median mcap / TVL</span><b><em>' + DATA.comparables.global.toFixed(3) + '×</em></b></div>';
    }
    var top = DATA.rows.slice(0, 3);
    var spot = document.getElementById('spotlight');
    if (spot && top.length === 3) {
      var topMax = top[0].implied_value_usd || 1;
      spot.innerHTML = top.map(function (r) {
        var pct = Math.max(8, Math.round((r.implied_value_usd / topMax) * 100));
        return '<article class="spot"><div class="spot-rank">Rank ' + r.rank + ' · ' + (r.on_watchlist ? 'watchlist' : 'early find') + '</div>'
          + '<h2>' + esc(r.name) + '</h2><div class="spot-sub">' + esc(r.category || 'Other') + ' · ' + chainList(r) + '</div>'
          + '<div class="spot-value">' + esc(fmtUsd(r.implied_value_usd)) + ' <small>implied</small></div>'
          + '<div class="spot-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
          + '<div class="spot-facts"><span>TVL ' + esc(fmtUsd(r.tvl_usd)) + '</span><span>7d ' + esc(fmtPct(r.change_7d)) + '</span><span>Age ' + esc(fmtAge(r.age_days)) + '</span></div></article>';
      }).join('');
    }
    var foot = document.getElementById('foot-source');
    if (foot) foot.textContent = 'Source: ' + DATA.source + '.';
    var model = document.getElementById('model-panel');
    if (model) {
      var m = DATA.model;
      var cats = Object.entries(DATA.comparables.by_category).sort(function (a, b) { return b[1] - a[1]; });
      var catLine = cats.slice(0, 5).map(function (kv) { return esc(kv[0]) + ' <b>' + kv[1].toFixed(3) + '×</b>'; }).join(' · ');
      model.innerHTML = '<h2>How implied value is computed</h2>'
        + '<p>Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>'
        + '<div class="formula">implied = round( tvl_usd × <b>comparable multiple</b> × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × <b>maturity bell</b> × (1 + 0.03 × chains over one) )</div>'
        + '<p>The comparable multiple is the median market-cap-to-TVL ratio of the live-token protocols in this snapshot — the whole market, blended with the protocol\u2019s own category. The maturity bell peaks near ' + Math.round(m.maturity_peak_days / 365) + ' years with no token and falls on both sides: too young to have proven itself, or old enough to have shown it likely never launches. Growth is the TVL change over seven days; age is the time since the protocol was first listed.</p>'
        + '<div class="model-facts"><span>Market multiple <b>' + DATA.comparables.global.toFixed(3) + '×</b></span><span>Strongest categories: ' + catLine + '</span></div>';
    }
  }

  function fillOptions() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = document.getElementById('category');
    if (catSel) {
      catSel.innerHTML = '<option value="all">All categories</option>' + cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = document.getElementById('chain');
    if (chainSel) {
      chainSel.innerHTML = '<option value="all">All chains</option>' + chains.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }
  }

  // -- the detail panel --------------------------------------------------------------------
  var dialog = document.getElementById('detail');
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row || !dialog) return;
    state.selected = slug;
    writeHash();
    var check = modelOf(row);
    var steps = farmSteps(row);
    var catMult = row.category && DATA.comparables.by_category[row.category] !== undefined
      ? DATA.comparables.by_category[row.category] : null;
    var stepsHtml = steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    dialog.innerHTML = '<div class="detail-head"><div>'
      + '<span class="kicker">Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.on_watchlist ? 'watchlist' : 'early find') + '</span>'
      + '<h2 id="detail-name">' + esc(row.name) + '</h2>'
      + '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p></div>'
      + '<button type="button" class="close-btn" id="detail-close">Close</button></div>'
      + '<section class="detail-sec"><h3>Implied value</h3><div class="breakdown">'
      + '<div><span>TVL</span><b>' + esc(fmtUsd(row.tvl_usd)) + '</b></div>'
      + '<div><span>Seven-day growth</span><b>' + esc(fmtPct(row.change_7d)) + '</b></div>'
      + '<div><span>Age with no token</span><b>' + esc(fmtAge(row.age_days)) + '</b></div>'
      + '<div><span>Comparable multiple (' + esc(row.category || 'no category') + ')</span><b>' + row.comparable_multiple.toFixed(3) + '×</b></div>'
      + '<div><span>Growth multiplier</span><b>' + check.growthMult.toFixed(4) + '</b></div>'
      + '<div><span>Maturity multiplier</span><b>' + check.maturityMult.toFixed(4) + '</b></div>'
      + '<div><span>Chain multiplier</span><b>' + check.chainMult.toFixed(4) + '</b></div>'
      + '<div class="total"><span>Implied value</span><b>' + esc(fmtUsd(row.implied_value_usd)) + '</b></div>'
      + '</div><p class="check-line">The page recomputes this row as <b>' + esc(fmtUsd(check.implied)) + '</b>'
      + (check.implied === row.implied_value_usd ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.')
      + ' This is an estimate, not a price.</p>'
      + (catMult !== null
        ? '<p class="compare-note">Comparables: live ' + esc(row.category) + ' protocols trade at a median <b>' + catMult.toFixed(3) + '×</b> market cap to TVL, against <b>' + DATA.comparables.global.toFixed(3) + '×</b> for the whole live market.</p>'
        : '<p class="compare-note">Comparables: too few live ' + esc(row.category || 'uncategorised') + ' protocols to trust a category median, so the market-wide <b>' + DATA.comparables.global.toFixed(3) + '×</b> stands in.</p>')
      + '</section>'
      + '<section class="detail-sec"><h3>Farm plan</h3><ol class="steps">' + stepsHtml + '</ol></section>';
    var close = document.getElementById('detail-close');
    if (close) close.addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  if (dialog) dialog.addEventListener('close', function () { state.selected = null; writeHash(); renderBoard(); });

  // -- render + wiring ---------------------------------------------------------------------
  function renderBoard() {
    root.innerHTML = state.tab === 'pre' ? boardTable() : liveTable();
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    if (pre) pre.setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    if (live) live.setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; syncToolbar(); writeHash(); renderBoard(); });
    root.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        renderBoard();
      });
    });
    root.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      var open = function () { openDetail(tr.getAttribute('data-slug')); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function syncToolbar() {
    var q = document.getElementById('q');
    if (q) q.value = state.q;
    var cat = document.getElementById('category');
    if (cat) cat.value = state.category;
    var chain = document.getElementById('chain');
    if (chain) chain.value = state.chain;
    var watch = document.getElementById('watch-only');
    if (watch) watch.checked = state.watchOnly;
  }

  function wireToolbar() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); renderBoard(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); renderBoard(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); renderBoard(); });
    var watch = document.getElementById('watch-only');
    if (watch) watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); renderBoard(); });
    var pre = document.getElementById('tab-pre');
    if (pre) pre.addEventListener('click', function () { state.tab = 'pre'; writeHash(); renderBoard(); });
    var live = document.getElementById('tab-live');
    if (live) live.addEventListener('click', function () { state.tab = 'live'; writeHash(); renderBoard(); });
  }

  readHash();
  renderChrome();
  fillOptions();
  syncToolbar();
  wireToolbar();
  renderBoard();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && dialog.open) dialog.close();
  });
})();

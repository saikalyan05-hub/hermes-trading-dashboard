"use strict";

const API_BASE = (window.HERMES_API_BASE || "").replace(/\/$/, "");
const REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours

const $ = (id) => document.getElementById(id);
const pct = (x) => (x * 100).toFixed(3) + "%";
const usd = (x) => (x >= 0 ? "+$" : "-$") + Math.abs(x).toFixed(2);
const cls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");

function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// P&L in simulated dollars for one trade (sign by direction).
function tradePnlUsd(t) {
  const dir = (t.direction || "long") === "long" ? 1 : -1;
  const amt = Number(t.amount || 0);
  return dir * (Number(t.exit_price) - Number(t.entry_price)) * amt;
}

function showBanner(msg) {
  const b = $("banner");
  b.textContent = msg;
  b.classList.remove("hidden");
}
function hideBanner() {
  $("banner").classList.add("hidden");
}

async function getJSON(path) {
  const res = await fetch(API_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function renderSummary(trades) {
  const closed = trades.filter((t) => t.closed);
  $("tradeCount").textContent = closed.length;

  const wins = closed.filter((t) => Number(t.return_pct) > 0).length;
  const losses = closed.filter((t) => Number(t.return_pct) < 0).length;
  $("winLoss").textContent = `${wins} wins · ${losses} losses`;
  $("winRate").textContent = closed.length ? Math.round((wins / closed.length) * 100) + "%" : "—";

  let totalUsd = 0;
  let compounded = 1;
  closed.forEach((t) => {
    totalUsd += tradePnlUsd(t);
    compounded *= 1 + Number(t.return_pct || 0);
  });
  const totalPct = compounded - 1;
  const pnlEl = $("pnlUsd");
  pnlEl.textContent = closed.length ? usd(totalUsd) : "—";
  pnlEl.className = "value " + cls(totalUsd);
  $("pnlPct").textContent = closed.length ? `compounded ${pct(totalPct)}` : "no closed trades yet";
}

function tradeInvestedUsd(t) {
  return Number(t.amount || 0) * Number(t.entry_price || 0);
}

function renderMoney(trades) {
  const closed = trades.filter((t) => t.closed);
  let gains = 0, losses = 0, grossInvested = 0;
  closed.forEach((t) => {
    const pnl = tradePnlUsd(t);
    if (pnl >= 0) gains += pnl; else losses += -pnl;
    grossInvested += tradeInvestedUsd(t);
  });

  const perTrade = closed.length ? tradeInvestedUsd(closed[closed.length - 1]) : 0;
  $("investedPerTrade").textContent = closed.length ? "$" + perTrade.toFixed(2) : "—";
  $("totalGains").textContent = closed.length ? "+$" + gains.toFixed(2) : "—";
  $("totalLosses").textContent = closed.length ? "-$" + losses.toFixed(2) : "—";
  $("grossInvested").textContent = closed.length ? "$" + grossInvested.toFixed(2) : "—";

  const wins = closed.filter((t) => tradePnlUsd(t) >= 0).length;
  const loss = closed.length - wins;
  $("gainsHint").textContent = `${wins} winning trade${wins === 1 ? "" : "s"}`;
  $("lossesHint").textContent = `${loss} losing trade${loss === 1 ? "" : "s"}`;
}

function renderImprovement(trades) {
  const closed = trades.filter((t) => t.closed);
  const n = closed.length;

  // Latest vs previous trade.
  if (n >= 2) {
    const last = Number(closed[n - 1].return_pct);
    const prev = Number(closed[n - 2].return_pct);
    const delta = last - prev;
    const el = $("impPrev");
    el.textContent = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(3) + " pp";
    el.className = "value " + cls(delta);
    $("impPrevHint").textContent =
      `latest ${pct(last)} vs previous ${pct(prev)}`;
  } else {
    $("impPrev").textContent = "—";
    $("impPrevHint").textContent = "need at least 2 closed trades";
  }

  // Latest vs average of the 5 trades before it.
  if (n >= 2) {
    const last = Number(closed[n - 1].return_pct);
    const prior = closed.slice(Math.max(0, n - 6), n - 1).map((t) => Number(t.return_pct));
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
    const delta = last - avg;
    const el = $("imp5");
    el.textContent = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(3) + " pp";
    el.className = "value " + cls(delta);
    $("imp5Hint").textContent =
      `latest ${pct(last)} vs prior-${prior.length} avg ${pct(avg)}`;
  } else {
    $("imp5").textContent = "—";
    $("imp5Hint").textContent = "need more closed trades";
  }
}

function renderTrades(trades) {
  const closed = trades.filter((t) => t.closed);
  const body = $("tradesBody");
  if (!closed.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty">No closed trades yet — a position may be open.</td></tr>`;
    return;
  }
  body.innerHTML = "";
  // Newest first.
  closed.slice().reverse().forEach((t) => {
    const ret = Number(t.return_pct);
    const pnl = tradePnlUsd(t);
    const held = fmtDuration(new Date(t.closed_at) - new Date(t.opened_at));
    const side = (t.direction || "long").toUpperCase();
    const sideCls = (t.direction || "long") === "long" ? "side-long" : "side-short";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="${sideCls}">${side}</td>
      <td>${fmtTime(t.opened_at)}</td>
      <td>${fmtTime(t.closed_at)}</td>
      <td>${held}</td>
      <td>${Number(t.entry_price).toFixed(2)}</td>
      <td>${Number(t.exit_price).toFixed(2)}</td>
      <td class="${cls(ret)}">${pct(ret)}</td>
      <td class="${cls(pnl)}">${usd(pnl)}</td>
      <td>${t.exit_reason || "—"}</td>`;
    body.appendChild(tr);
  });
}

function renderLive(hb, strat) {
  const open = hb && hb.position_open;
  const ps = $("posState");
  ps.textContent = open ? "In position" : (hb && hb.status === "ok" ? "Flat" : "—");
  ps.className = "value " + (open ? "pos" : "");
  if (hb) {
    const trend = hb.trend_4h ? `4H ${hb.trend_4h}` : "";
    const px = hb.price != null ? `$${Number(hb.price).toFixed(2)}` : "";
    $("liveInfo").textContent = [trend, px].filter(Boolean).join(" · ") || "—";
  }
  if (strat && strat.version) {
    $("stratVer").textContent = "v" + strat.version;
    $("stratHint").textContent =
      `order-block · trend EMA ${strat.trend_ema} · lookback ${strat.ob_lookback} · RR 1:${strat.rr}`;
  }

  // Open position box (entry / stop-loss / take-profit).
  const opEl = $("openPos"), opHint = $("openPosHint");
  if (open && hb.position) {
    const p = hb.position;
    const sideCls = p.side === "long" ? "side-long" : "side-short";
    opEl.innerHTML = `<span class="${sideCls}">${(p.side || "").toUpperCase()}</span> @ ${p.entry}`;
    opHint.innerHTML = `<span class="neg">SL ${p.stop_loss}</span> &nbsp; <span class="pos">TP ${p.take_profit}</span>`;
  } else {
    opEl.textContent = "Flat";
    opEl.className = "value";
    opHint.textContent = "no open position";
  }
}

function renderImprovements(history) {
  const box = $("improvements");
  if (!Array.isArray(history) || !history.length) {
    box.innerHTML = `<div class="empty">No improvements yet — the agent reflects every 5 closed trades.</div>`;
    return;
  }
  box.innerHTML = "";
  history.slice().reverse().forEach((h) => {
    const score = h.observed && typeof h.observed.score === "number"
      ? h.observed.score.toFixed(3) : "—";
    const reason = h.reason || h.rule || "";
    const item = document.createElement("div");
    item.className = "tl-item";
    item.innerHTML = `
      <div class="tl-head">
        <span class="tl-ver">v${h.from_version || "?"} &rarr; v${h.to_version || "?"}</span>
        <span class="tl-time">${fmtTime(h.ts)}</span>
      </div>
      <div class="tl-change"><code>${h.variable || "?"}</code> = <b>${h.new_value}</b></div>
      <div class="tl-reason">${reason}</div>
      <div class="tl-meta">mode: ${h.mode || "?"} · score at change: ${score}</div>`;
    box.appendChild(item);
  });
}

function drawChart(prices, trades, hb) {
  const canvas = $("priceChart");
  const empty = $("chartEmpty");
  if (!Array.isArray(prices) || prices.length < 2) {
    canvas.style.display = "none"; empty.style.display = "block"; return;
  }
  canvas.style.display = "block"; empty.style.display = "none";

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
  const cssH = 320;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 60, padR = 14, padT = 12, padB = 26;
  const W = cssW - padL - padR, H = cssH - padT - padB;
  const times = prices.map((p) => new Date(p.t).getTime());
  const vals = prices.map((p) => p.price);
  const tMin = Math.min(...times), tMax = Math.max(...times);
  let pMin = Math.min(...vals), pMax = Math.max(...vals);

  const closed = (trades || []).filter((t) => t.closed);
  closed.forEach((t) => {
    pMin = Math.min(pMin, t.entry_price, t.exit_price);
    pMax = Math.max(pMax, t.entry_price, t.exit_price);
  });
  // Include the open position's entry/SL/TP so their lines are on-screen.
  const pos = hb && hb.position_open && hb.position ? hb.position : null;
  if (pos) {
    [pos.entry, pos.stop_loss, pos.take_profit].forEach((lvl) => {
      if (lvl) { pMin = Math.min(pMin, lvl); pMax = Math.max(pMax, lvl); }
    });
  }
  if (pMin === pMax) { pMin -= 1; pMax += 1; }
  const padP = (pMax - pMin) * 0.08; pMin -= padP; pMax += padP;

  const x = (t) => padL + (tMax === tMin ? 0 : (t - tMin) / (tMax - tMin)) * W;
  const y = (v) => padT + (1 - (v - pMin) / (pMax - pMin)) * H;

  ctx.strokeStyle = "#232c3b"; ctx.fillStyle = "#8b98ab";
  ctx.font = "11px sans-serif"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = pMin + (pMax - pMin) * i / 4, yy = y(v);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
    ctx.fillText(v.toFixed(0), 6, yy + 3);
  }
  ctx.fillText(new Date(tMin).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), padL, cssH - 8);
  ctx.fillText(new Date(tMax).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), padL + W - 34, cssH - 8);

  ctx.strokeStyle = "#4c8dff"; ctx.lineWidth = 1.6; ctx.beginPath();
  prices.forEach((p, i) => {
    const xx = x(times[i]), yy = y(p.price);
    i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
  });
  ctx.stroke();

  const marker = (t, v, color) => {
    const tt = new Date(t).getTime();
    if (tt < tMin || tt > tMax) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x(tt), y(v), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#0c1018"; ctx.lineWidth = 1; ctx.stroke();
  };
  closed.forEach((t) => {
    const entryColor = (t.direction || "long") === "long" ? "#2ecc71" : "#ff9f43";
    marker(t.opened_at, t.entry_price, entryColor);
    marker(t.closed_at, t.exit_price, "#ff5c5c");
  });

  // Open-position lines: TP (green), entry (grey), SL (red) — dashed, labelled.
  if (pos) {
    const hline = (v, color, label) => {
      if (v == null || v < pMin || v > pMax) return;
      const yy = y(v);
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = "10px sans-serif";
      ctx.fillText(`${label} ${Number(v).toFixed(0)}`, padL + 4, yy - 3);
    };
    hline(pos.take_profit, "#2ecc71", "TP");
    hline(pos.entry, "#8b98ab", "entry");
    hline(pos.stop_loss, "#ff5c5c", "SL");
  }
}

let _filesLoaded = false;

async function loadFile(path, liEl) {
  const view = $("fileView");
  view.textContent = "Loading " + path + " …";
  document.querySelectorAll("#fileList li").forEach((li) => li.classList.remove("active"));
  if (liEl) liEl.classList.add("active");
  try {
    const data = await getJSON("/api/file?path=" + encodeURIComponent(path));
    view.textContent = data.content != null ? data.content : "(empty)";
  } catch (err) {
    view.textContent = "Couldn't load " + path + ": " + err.message;
  }
}

async function renderFiles() {
  if (_filesLoaded) return; // file list is static; load once
  const list = $("fileList");
  try {
    const files = await getJSON("/api/files");
    if (!files.length) { list.innerHTML = `<li class="empty">No files</li>`; return; }
    list.innerHTML = "";
    files.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f.path;
      li.title = f.path + " (" + f.size + " bytes)";
      li.addEventListener("click", () => loadFile(f.path, li));
      list.appendChild(li);
    });
    _filesLoaded = true;
  } catch (err) {
    list.innerHTML = `<li class="empty">Couldn't load file list: ${err.message}</li>`;
  }
}

function pairFills(fills) {
  // Real Bybit fills (oldest-first) -> paired trades. One-way account: a fill
  // opens, the next opposite fill closes. Gives complete, accurate history.
  const out = [];
  let open = null;
  for (const f of fills) {
    const px = Number(f.price), amt = Number(f.amount);
    if (!isFinite(px)) continue;
    if (!open) {
      open = { side: f.side === "buy" ? "long" : "short", entry: px, t: f.time, amount: amt };
    } else {
      const dir = open.side;
      const ret = dir === "long" ? (px - open.entry) / open.entry : (open.entry - px) / open.entry;
      out.push({
        closed: true, direction: dir,
        entry_price: open.entry, exit_price: px, amount: open.amount,
        return_pct: ret, exit_reason: "closed",
        opened_at: open.t, closed_at: f.time,
      });
      open = null;
    }
  }
  return out;
}

async function refresh() {
  $("apiUrl").textContent = API_BASE || "(not configured)";
  if (!API_BASE || API_BASE.includes("__API_BASE__")) {
    showBanner("API URL not configured yet. Set window.HERMES_API_BASE in config.js.");
    return;
  }
  try {
    const [ledger, hb, strat, history, prices, fills] = await Promise.all([
      getJSON("/api/trades").catch(() => ([])),
      getJSON("/api/heartbeat").catch(() => ({})),
      getJSON("/api/strategy").catch(() => ({})),
      getJSON("/api/history").catch(() => ([])),
      getJSON("/api/prices").catch(() => ([])),
      getJSON("/api/broker/fills").catch(() => ([])),
    ]);
    hideBanner();
    // Prefer the REAL Bybit fills (paired) — complete source of truth, incl.
    // trades closed externally. Fall back to the worker ledger (sim mode).
    const trades = (Array.isArray(fills) && fills.length) ? pairFills(fills) : ledger;
    renderSummary(trades);
    renderMoney(trades);
    renderImprovement(trades);
    renderTrades(trades);
    renderLive(hb, strat);
    renderImprovements(history);
    drawChart(prices, trades, hb);
    renderFiles();
    $("updatedAt").textContent = new Date().toLocaleString();
  } catch (err) {
    showBanner(
      "Couldn't reach the worker API: " + err.message +
      ". The Railway service may be asleep or out of free-tier credit."
    );
  }
}

$("refreshBtn").addEventListener("click", refresh);
refresh();
setInterval(refresh, REFRESH_MS);

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
  closed.slice().reverse().forEach((t, i) => {
    const ret = Number(t.return_pct);
    const pnl = tradePnlUsd(t);
    const held = fmtDuration(new Date(t.closed_at) - new Date(t.opened_at));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${closed.length - i}</td>
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
  if (hb && hb.price != null) {
    $("liveInfo").textContent =
      `RSI ${Number(hb.rsi).toFixed(1)} · $${Number(hb.price).toFixed(2)} · ${hb.signal_source || ""}`;
  }
  if (strat && strat.version) {
    $("stratVer").textContent = "v" + strat.version;
    const thr = strat.entry ? strat.entry.threshold : "?";
    $("stratHint").textContent = `RSI entry < ${thr} · stop ${strat.stop_loss_pct}%`;
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

async function refresh() {
  $("apiUrl").textContent = API_BASE || "(not configured)";
  if (!API_BASE || API_BASE.includes("__API_BASE__")) {
    showBanner("API URL not configured yet. Set window.HERMES_API_BASE in config.js.");
    return;
  }
  try {
    const [trades, hb, strat, history] = await Promise.all([
      getJSON("/api/trades"),
      getJSON("/api/heartbeat").catch(() => ({})),
      getJSON("/api/strategy").catch(() => ({})),
      getJSON("/api/history").catch(() => ([])),
    ]);
    hideBanner();
    renderSummary(trades);
    renderMoney(trades);
    renderImprovement(trades);
    renderTrades(trades);
    renderLive(hb, strat);
    renderImprovements(history);
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

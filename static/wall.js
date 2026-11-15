// The language wall, enhanced: adds one without reloading the page, and
// receives broadcasts, with polling while visible as a fallback. Without
// this script the wall still shows the counts (rendered by the front) and
// each button is a plain form post.
(() => {
  "use strict";
  const wall = document.getElementById("wall");
  if (!wall || !window.fetch) return;
  const status = wall.querySelector(".wall-status");
  const items = new Map(Array.from(wall.querySelectorAll(".wall-item[data-lang]"),
    (item) => [item.dataset.lang, item]));
  const counts = new Map();
  let snapshot = { wall: [] };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const show = (lang, count) => {
    const item = items.get(lang);
    const out = item && item.querySelector(".wall-count");
    if (!out || !Number.isSafeInteger(count) || count < 0) return;
    // Counters only increment. Concurrent POST replies, snapshots and
    // notifications can arrive out of order; never move a tile backwards.
    count = Math.max(count, counts.get(lang) || 0);
    counts.set(lang, count);
    const text = String(count);
    if (out.textContent !== text) {
      out.textContent = text;
      out.classList.remove("bumped");
      if (!reducedMotion.matches) {
        void out.offsetWidth;
        out.classList.add("bumped");
      }
    }
  };

  const identifyCurrent = () => {
    identify({ wall: snapshot.wall.map((entry) => counts.has(entry.lang)
      ? { ...entry, count: counts.get(entry.lang), state: "live" }
      : entry) });
  };

  // "Behind the tile": the live actors, from the front's answer.
  const field = (id) => wall.querySelector(`[data-id="${id}"]`);
  const identify = (body) => {
    const entries = body.wall || [];
    const live = entries.filter((e) => e.state === "live");
    const set = (id, text) => {
      const el = field(id);
      if (el) el.textContent = text;
    };
    set("total", String(live.reduce((sum, e) => sum + (Number(e.count) || 0), 0)));
    const addrs = field("addrs");
    if (addrs) {
      addrs.replaceChildren();
      live.forEach((e, i) => {
        if (i) addrs.append(", ");
        const c = document.createElement("code");
        c.textContent = `${e.lang}/wall`;
        addrs.append(c);
      });
      if (!live.length) addrs.textContent = "none answering";
    }
    // The front's answer, without the fields this page does not use.
    const rows = live.map((e) => `    ${JSON.stringify({ lang: e.lang, name: e.name, state: e.state, count: e.count })}`).join(",\n");
    set("json", `{\n  "wall": [\n${rows}\n  ]\n}`);
  };

  const refresh = async () => {
    try {
      const r = await fetch("/api/wall", { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const body = await r.json();
      if (!Array.isArray(body.wall)) return;
      snapshot = body;
      for (const entry of body.wall || []) show(entry.lang, entry.count);
      identifyCurrent();
    } catch (_) {
      // Offline or the front is restarting: keep what is shown.
    }
  };

  let socket;
  let retry;
  let backoff = 1000;
  let stopped = false;
  const connect = () => {
    if (stopped || socket || !window.WebSocket) return;
    try {
      const url = new URL("/api/wall/live", window.location.href);
      url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
    } catch (_) {
      // Unsupported or blocked: the existing GET/POST behaviour still works.
      return;
    }
    const connection = socket;
    connection.addEventListener("open", () => {
      backoff = 1000;
      // Catch writes between the initial GET and opening, or while offline.
      refresh();
    });
    connection.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > 128) return;
      try {
        const body = JSON.parse(event.data);
        if (!body || !items.has(body.lang)) return;
        show(body.lang, body.count);
        identifyCurrent();
      } catch (_) {
        // A malformed message must not break the wall.
      }
    });
    connection.addEventListener("error", () => connection.close());
    connection.addEventListener("close", () => {
      if (socket !== connection) return;
      socket = null;
      if (stopped) return;
      retry = setTimeout(connect, backoff + Math.random() * backoff / 4);
      backoff = Math.min(backoff * 2, 30000);
    });
  };

  // Release the connection on navigation, including back/forward caching.
  window.addEventListener("pagehide", () => {
    stopped = true;
    clearTimeout(retry);
    const connection = socket;
    socket = null;
    if (connection) connection.close();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      stopped = false;
      refresh().then(connect);
    }
  });

  wall.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const button = form.querySelector("button");
    const name = form.closest(".wall-item").querySelector(".wall-name").textContent;
    if (button) button.disabled = true;
    try {
      const r = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(String(r.status));
      const body = await r.json();
      show(body.lang, body.count);
      refresh();
      status.textContent = `${name}: ${body.count}, written to ${body.lang}/wall's own database.`;
    } catch (_) {
      status.textContent = `${name}: that did not go through; try again.`;
    } finally {
      if (button) button.disabled = false;
    }
  });

  refresh().then(connect);
  setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 15000);
})();

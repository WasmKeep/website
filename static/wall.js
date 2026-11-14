// The language wall, enhanced: adds one without reloading the page, and
// refreshes the counts while the page is visible. Without this script the
// wall still shows the counts (rendered by the front) and each button is
// a plain form post.
(() => {
  "use strict";
  const wall = document.getElementById("wall");
  if (!wall || !window.fetch) return;
  const status = wall.querySelector(".wall-status");

  const show = (lang, count) => {
    const item = wall.querySelector(`.wall-item[data-lang="${lang}"]`);
    const out = item && item.querySelector(".wall-count");
    if (!out || count === null || count === undefined) return;
    const text = String(count);
    if (out.textContent !== text) {
      out.textContent = text;
      out.classList.remove("bumped");
      void out.offsetWidth;
      out.classList.add("bumped");
    }
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
      for (const entry of body.wall || []) show(entry.lang, entry.count);
      identify(body);
    } catch (_) {
      // Offline or the front is restarting: keep what is shown.
    }
  };

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

  refresh();
  setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 15000);
})();

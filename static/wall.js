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

  const refresh = async () => {
    try {
      const r = await fetch("/api/wall", { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const body = await r.json();
      for (const entry of body.wall || []) show(entry.lang, entry.count);
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
      status.textContent = body.node
        ? `${name}: ${body.count}, answered by node ${body.node}.`
        : `${name}: ${body.count}.`;
    } catch (_) {
      status.textContent = `${name}: that did not go through; try again.`;
    } finally {
      if (button) button.disabled = false;
    }
  });

  setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 15000);
})();

// Code tabs: turns each [data-tabs] block into tabs (ARIA tabs pattern,
// arrow keys, Home and End). Without this script every panel shows, each
// with its own heading.
(() => {
  "use strict";
  for (const box of document.querySelectorAll("[data-tabs]")) {
    const panels = [...box.querySelectorAll(":scope > .tab-panel")];
    if (panels.length < 2) continue;
    const list = document.createElement("div");
    list.className = "tab-list";
    list.setAttribute("role", "tablist");
    list.setAttribute("aria-label", "Language");
    const tabs = panels.map((panel, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.id = `${panel.id}-tab`;
      tab.textContent = panel.dataset.tabLabel;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      list.append(tab);
      tab.addEventListener("click", () => select(i, false));
      return tab;
    });
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    };
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const n = tabs.length;
      const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(to, true);
    });
    box.prepend(list);
    box.classList.add("js");
    select(0, false);
  }
})();

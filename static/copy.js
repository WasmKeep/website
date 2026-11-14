// A copy button on each command block marked data-copy. Without this
// script the commands are plain text to select.
(() => {
  "use strict";
  if (!navigator.clipboard) return;
  for (const pre of document.querySelectorAll("pre[data-copy]")) {
    const wrap = document.createElement("div");
    wrap.className = "copy-wrap";
    pre.replaceWith(wrap);
    wrap.append(pre);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    const note = document.createElement("span");
    note.className = "copy-note";
    note.setAttribute("role", "status");
    wrap.append(button, note);
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent.replace(/\s+$/, "") + "\n");
        note.textContent = "Copied";
      } catch (_) {
        note.textContent = "Select the text to copy it";
      }
      setTimeout(() => (note.textContent = ""), 2000);
    });
  }
})();

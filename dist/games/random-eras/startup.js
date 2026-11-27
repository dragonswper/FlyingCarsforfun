// This small independent script still works if the main game bundle cannot load.
(() => {
  const status = document.getElementById("startup-status");
  const menu = document.getElementById("menu");
  const reload = document.getElementById("startup-reload");
  if (!status || !menu || !reload) return;
  let ready = document.documentElement.dataset.gameReady === "true";
  let timer;
  function finish() {
    ready = true;
    clearTimeout(timer);
    status.hidden = true;
    menu.inert = false;
  }
  function failed(message) {
    if (ready) return;
    status.hidden = false;
    document.getElementById("startup-message").textContent = message;
    reload.hidden = false;
    menu.inert = true;
  }
  reload.addEventListener("click", () => location.reload());
  window.addEventListener("random-eras:ready", finish, { once: true });
  window.addEventListener(
    "error",
    (event) => {
      if (!ready && (event.target?.tagName === "SCRIPT" || event.error))
        failed(
          "The game could not start. Reload to download the latest game files.",
        );
    },
    true,
  );
  window.addEventListener("unhandledrejection", () => {
    if (!ready)
      failed(
        "The game could not finish loading. Check your connection and reload.",
      );
  });
  if (ready) finish();
  else {
    menu.inert = true;
    timer = setTimeout(
      () =>
        failed(
          "Loading is taking longer than expected. Check your connection and reload.",
        ),
      20000,
    );
  }
})();

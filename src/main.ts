import "./app.css";

// `?demo=<vue>` : interface de démonstration avec une bibliothèque fictive (captures du README).
async function start() {
  const demo = new URLSearchParams(location.search).get("demo");
  // La simulation doit être en place avant le chargement des modules qui écoutent le backend.
  const afterMount = demo !== null ? await (await import("./lib/demo")).installDemo(demo) : null;
  const [{ mount }, { default: App }, { detectDevice, device }, { setupBackButton }, { enableSpatialNavigation }] =
    await Promise.all([
      import("svelte"),
      import("./App.svelte"),
      import("./lib/device"),
      import("./lib/nav.svelte"),
      import("./lib/spatial"),
    ]);
  await detectDevice();
  setupBackButton();
  // Sur téléviseur, les flèches de la télécommande déplacent le focus d'un élément à l'autre.
  if (device.tv) {
    enableSpatialNavigation(() => false);
    (await import("./lib/sidebar.svelte")).collapseForTv();
  }
  mount(App, { target: document.getElementById("app")! });
  await afterMount?.();
}

start();

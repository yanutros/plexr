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
  (await import("./lib/i18n")).initLanguage();
  // Couleur choisie, avant le premier affichage (sinon un éclair de jaune).
  const { applyTheme, savedTheme } = await import("./lib/theme");
  applyTheme(savedTheme());
  setupBackButton();
  // Sur téléviseur, les flèches de la télécommande déplacent le focus d'un élément à l'autre.
  if (device.tv) {
    enableSpatialNavigation(() => false);
    (await import("./lib/sidebar.svelte")).collapseForTv();
  }
  // Téléphone : un onglet touché dans une bande qui défile (bibliothèques, musique, réglages)
  // vient se centrer, pour que son nom et ses voisins restent lisibles.
  if (device.phone) {
    document.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[role="tablist"] > button, .settings .menu button');
      tab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
  }
    mount(App, { target: document.getElementById("app")! });
  await afterMount?.();
}

start();

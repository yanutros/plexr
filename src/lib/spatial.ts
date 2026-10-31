// Navigation à la télécommande (Android TV) : les flèches déplacent le focus vers l'élément
// le plus proche dans la direction choisie, et « OK » l'active comme un clic.
// Chaque zone (`data-nav-zone` : menu, contenu) retient son dernier élément sélectionné, et
// les éléments `data-nav-low` (recherche, onglets) ne sont choisis qu'en dernier recours.

const FOCUSABLE = 'button:not(:disabled), a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.opacity !== "0" && !el.closest("[inert], [aria-hidden='true']");
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

const last = new WeakMap<Element, HTMLElement>();

function zone(el: Element | null): Element | null {
  return el?.closest("[data-nav-zone]") ?? null;
}

/** Zone où chercher : la fenêtre modale ouverte s'il y en a une, sinon toute la page. */
function scope(): ParentNode {
  const layers = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"]');
  return layers.length ? layers[layers.length - 1] : document;
}

function best(from: DOMRect, dir: Dir, candidates: HTMLElement[]): HTMLElement | null {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let winner: HTMLElement | null = null;
  let score = Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    // L'élément doit se trouver franchement dans la direction demandée.
    const ok =
      (dir === "ArrowRight" && r.left >= from.right - 8) ||
      (dir === "ArrowLeft" && r.right <= from.left + 8) ||
      (dir === "ArrowDown" && r.top >= from.bottom - 8) ||
      (dir === "ArrowUp" && r.bottom <= from.top + 8);
    if (!ok) continue;
    const horizontal = dir === "ArrowLeft" || dir === "ArrowRight";
    const main = horizontal ? Math.abs(x - cx) : Math.abs(y - cy);
    const side = horizontal ? Math.abs(y - cy) : Math.abs(x - cx);
    // On privilégie l'alignement : un léger écart latéral coûte cher.
    const s = main + side * 2.5 + (el.closest("[data-nav-low]") ? 1e6 : 0);
    if (s < score) {
      score = s;
      winner = el;
    }
  }
  return winner;
}

export function moveFocus(dir: Dir): boolean {
  const current = document.activeElement as HTMLElement | null;
  // Rien de sélectionné (premier appui, ou focus posé par le WebView sur un bloc de la page) :
  // on part de l'élément par défaut de la page.
  if (!current || current === document.body || !current.matches(FOCUSABLE)) {
    const start = document.querySelector<HTMLElement>("[data-nav-default]");
    if (start && visible(start)) {
      start.focus({ preventScroll: true });
      return true;
    }
  }
  const all = [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el !== current && el.tabIndex >= 0 && visible(el),
  );
  if (!all.length) return false;
  const from =
    current && current !== document.body
      ? current.getBoundingClientRect()
      : new DOMRect(window.innerWidth / 2, 0, 0, 0);
  let target = best(from, dir, all);
  if (!target) return false;
  // En changeant de zone, on retrouve l'élément quitté s'il est encore à l'écran.
  const into = zone(target);
  if (into && into !== zone(current)) {
    // En entrant dans une zone : l'élément quitté, sinon celui de la page en cours (menu).
    const back = last.get(into) ?? into.querySelector<HTMLElement>('[aria-current="page"]');
    if (back && back.isConnected && visible(back) && onScreen(back)) target = back;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  return true;
}

/** Active la navigation à la télécommande. `skip()` : true quand une autre partie gère les flèches. */
export function enableSpatialNavigation(skip: () => boolean) {
  window.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    const z = zone(el);
    if (z && !el.closest("[data-nav-low]")) last.set(z, el);
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) || skip()) return;
      const target = e.target as HTMLElement;
      // Les grilles `data-nav-grid` (accueil TV) gèrent elles-mêmes leurs flèches.
      if (target.closest?.("[data-nav-grid]")) return;
      // Dans un champ de saisie, gauche / droite déplacent le curseur.
      if (target.matches("input[type=text], input[type=search], textarea") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      if (target.matches("select")) return;
      if (moveFocus(e.key as Dir)) e.preventDefault();
    },
    true,
  );
}

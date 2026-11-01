// Téléviseur : sur une jaquette qui porte un titre (`use:menuable`), OK ouvre au relâchement ;
// maintenu une demi-seconde, il ouvre le menu du titre (TvMenu), comme dans Plex. La touche Menu de
// la télécommande l'ouvre aussi, pour les télécommandes dont l'appui long n'arrive pas jusqu'à Maku.
import type { Item } from "./api";
import { nav } from "./nav.svelte";

const HOLD_MS = 500;
const items = new WeakMap<HTMLElement, Item>();

/** Action Svelte : la jaquette `el` ouvre le menu de `item` (sans titre, rien ne change). */
export function menuable(el: HTMLElement, item: Item | undefined) {
  const set = (it: Item | undefined) => {
    if (it) {
      items.set(el, it);
      el.dataset.menu = "";
    } else {
      items.delete(el);
      delete el.dataset.menu;
    }
  };
  set(item);
  return { update: set, destroy: () => items.delete(el) };
}

export function enableLongPress() {
  let target: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let opened = false;

  const openMenu = (el: HTMLElement) => {
    const item = items.get(el);
    if (item) nav.tvMenu = { item };
  };

  // Le menu ouvert prend le focus : la touche, encore enfoncée, ne doit pas y valider un choix.
  const swallow = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !target) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (opened && swallow(e)) return;
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-menu]");
      if (!el) return;
      if (e.key === "ContextMenu" || e.key === "Menu") {
        e.preventDefault();
        openMenu(el);
        return;
      }
      if (e.key !== "Enter") return;
      // Pas de clic à l'appui : il viendra au relâchement, sauf si le menu s'est ouvert.
      e.preventDefault();
      // OK maintenu : certaines télécommandes renvoient la touche toutes les 50 ms sans la marquer
      // comme répétée ; tant qu'elle n'est pas relâchée, c'est le même appui.
      if (target === el) return;
      target = el;
      opened = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        opened = true;
        openMenu(el);
      }, HOLD_MS);
    },
    true,
  );

  // Chromium déclenche le clic d'un bouton sur « keypress » : on le retient aussi.
  window.addEventListener(
    "keypress",
    (e) => {
      if (opened && swallow(e)) return;
      if (e.key === "Enter" && (e.target as HTMLElement | null)?.closest?.("[data-menu]")) e.preventDefault();
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key !== "Enter" || !target) return;
      clearTimeout(timer);
      if (opened) e.preventDefault();
      const el = target;
      target = null;
      if (!opened) el.click();
      opened = false;
    },
    true,
  );
}

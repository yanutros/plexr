// Couleur de l'interface (et de l'icône de l'application), gardée sur cet appareil.
import { invoke } from "@tauri-apps/api/core";

export const THEMES = ["jaune", "rouge", "vert", "violet"] as const;
export type Theme = (typeof THEMES)[number];

/** Teinte principale de chaque thème, pour les pastilles du choix (le reste est dans app.css). */
export const THEME_COLORS: Record<Theme, string> = {
  jaune: "#e5a00d",
  rouge: "#e50914",
  vert: "#1db954",
  violet: "#aa5cc3",
};

const KEY = "plexr.theme";

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY) as Theme | null;
    return t && THEMES.includes(t) ? t : "jaune";
  } catch {
    return "jaune";
  }
}

/**
 * Applique le thème à l'interface et à l'icône : fenêtre et barre des tâches sur ordinateur,
 * icône du lanceur sur Android (voir MainActivity.kt).
 */
export function applyTheme(theme: Theme, save = false) {
  document.documentElement.dataset.theme = theme;
  if (save) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Stockage indisponible : le thème ne vaut que pour cette session.
    }
  }
  const android = (window as { PlexrDevice?: { setIconTheme(theme: string): void } }).PlexrDevice;
  if (android) android.setIconTheme(theme);
  else invoke("set_app_icon", { theme }).catch(() => {});
}

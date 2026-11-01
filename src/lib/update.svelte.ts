// Nouvelle version de Plexr : cherchée au lancement, ou à la demande depuis les Réglages. Quand
// `update.info` est renseigné, la fenêtre « Nouvelle version disponible » s'affiche (UpdateDialog).
import { api, type UpdateInfo } from "./api";

// `notesOnly` : la même fenêtre sert de rappel des nouveautés de la version installée.
export const update = $state({ info: null as UpdateInfo | null, checking: false, notesOnly: false });

/** Ouvre les notes de la version installée. */
export async function showReleaseNotes() {
  update.checking = true;
  try {
    const info = await api.releaseNotes();
    update.notesOnly = true;
    update.info = info;
  } finally {
    update.checking = false;
  }
}

/** Cherche une nouvelle version ; renvoie `true` si une fenêtre de mise à jour s'ouvre. */
export async function checkForUpdate(): Promise<boolean> {
  update.checking = true;
  try {
    update.notesOnly = false;
    update.info = await api.updateCheck();
    return update.info !== null;
  } finally {
    update.checking = false;
  }
}

/**
 * Notes de version telles qu'affichées dans Plexr : les nouveautés et les corrections seulement, sans
 * la liste des paquets à télécharger (Plexr installe lui-même le bon). La release les donne en
 * français puis en anglais (« ## 🌍 What's new (English) ») : on garde la langue de l'interface.
 */
export function releaseHighlights(notes: string, locale: string): string {
  const sections = notes.split(/^(?=## )/m).filter((s) => s.trim());
  const install = (s: string) => /^## .*(paquets|packages|downloads?|installation)/i.test(s);
  const english = (s: string) => /^## .*english/i.test(s);
  const kept = sections.filter((s) => !install(s));
  const en = kept.filter(english).map((s) => s.replace(/^## [^\n]*\n/, ""));
  const fr = kept.filter((s) => !english(s));
  const chosen = locale.startsWith("fr") || !en.length ? fr : en;
  return chosen.join("\n").trim();
}

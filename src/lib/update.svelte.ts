// Nouvelle version de Plexr : cherchée au lancement, ou à la demande depuis les Réglages. Quand
// `update.info` est renseigné, la fenêtre « Nouvelle version disponible » s'affiche (UpdateDialog).
import { api, type UpdateInfo } from "./api";

export const update = $state({ info: null as UpdateInfo | null, checking: false });

/** Cherche une nouvelle version ; renvoie `true` si une fenêtre de mise à jour s'ouvre. */
export async function checkForUpdate(): Promise<boolean> {
  update.checking = true;
  try {
    update.info = await api.updateCheck();
    return update.info !== null;
  } finally {
    update.checking = false;
  }
}

// Plex renvoie la plupart des genres en anglais : on les affiche dans la langue de l'interface.
// Nom Plex → clé de traduction (genres.<clé>) ; un genre absent de la table garde son nom d'origine.
import { t } from "./i18n";

const KEYS: Record<string, string> = {
  "Action & Adventure": "actionAdventure",
  Adventure: "adventure",
  Anime: "anime",
  Biography: "biography",
  Children: "children",
  Kids: "kids",
  Comedy: "comedy",
  Crime: "crime",
  Documentary: "documentary",
  Drama: "drama",
  Family: "family",
  Fantasy: "fantasy",
  "Film-Noir": "filmNoir",
  "Food": "food",
  "Game Show": "gameShow",
  History: "history",
  "Home and Garden": "homeAndGarden",
  Horror: "horror",
  "Martial Arts": "martialArts",
  "Mini-Series": "miniSeries",
  Music: "music",
  Musical: "musical",
  Mystery: "mystery",
  News: "news",
  Reality: "reality",
  "Sci-Fi & Fantasy": "sciFiFantasy",
  "Science Fiction": "scienceFiction",
  "Science-Fiction": "scienceFictionAlt",
  Short: "short",
  Soap: "soap",
  Suspense: "suspense",
  Talk: "talk",
  Travel: "travel",
  "TV Movie": "tvMovie",
  War: "war",
  "War & Politics": "warPolitics",
};

export function genreLabel(title: string): string {
  const key = KEYS[title];
  if (!key) return title;
  const label = t(`genres.${key}`);
  // Clé introuvable dans toutes les langues : t() renvoie la clé elle-même.
  return label === `genres.${key}` ? title : label;
}

// Teinte stable par genre, pour que chaque tuile garde sa couleur.
const HUES = [12, 28, 45, 150, 175, 195, 215, 235, 260, 285, 310, 335];

export function genreHue(title: string): number {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

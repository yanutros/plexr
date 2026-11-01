// Logos du service en ligne de Plex (voir plex_remote_logo), demandés une seule fois par titre : celui
// dans la langue de l'interface passe avant celui du serveur (souvent en anglais), qui passe avant le
// logo anglais en ligne.
import { api } from "./api";

const cache = new Map<string, Promise<string | null>>();

/** Après un changement de clé TMDB : les logos introuvables jusque-là sont cherchés à nouveau. */
export function forgetRemoteLogos() {
  cache.clear();
}

/** `fallback` : accepter le logo anglais à défaut de logo dans la langue de l'interface. */
export function remoteLogo(guid: string, fallback = true): Promise<string | null> {
  const key = `${guid}|${fallback}`;
  let logo = cache.get(key);
  if (!logo) {
    logo = api.remoteLogo(guid, fallback).catch(() => null);
    cache.set(key, logo);
  }
  return logo;
}

export type TitleStyle = "action" | "epic" | "scifi" | "fun" | "horror" | "elegant";

// Mots-clés des genres (tels que Plex les renvoie, dans plusieurs langues), du plus marqué au plus
// général : le premier qui correspond donne le style du titre.
const STYLES: [TitleStyle, RegExp][] = [
  ["horror", /horr|terror|grusel|épouvante/i],
  ["scifi", /scien|sci-fi|ciencia|futur/i],
  ["epic", /fantas|fantastique|histo|heroic|épique|epic|mytho/i],
  ["fun", /com[ée]d|comed|kom[öo]d|anim|famil|kids|enfant|niñ|kinder|jeunesse/i],
  ["action", /action|acci[oó]n|thriller|crim|krimi|misdaad|polic|guerre|war\b|guerra|krieg|oorlog|western|suspense|aventure|adventure|aventura|abenteuer|avontuur/i],
  ["elegant", /roman|drame|drama|biog|music|docu/i],
];

/** Style typographique d'un titre sans logo, d'après ses genres. */
export function titleStyle(genres: string[] = []): TitleStyle {
  for (const [style, pattern] of STYLES) {
    if (genres.some((g) => pattern.test(g))) return style;
  }
  return "elegant";
}

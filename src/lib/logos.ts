// Logos de secours : quand le serveur n'a pas le logo d'un titre, on le demande une seule fois au
// service en ligne de Plex (voir plex_remote_logo) ; les titres affichés plusieurs fois le partagent.
import { api } from "./api";

const cache = new Map<string, Promise<string | null>>();

export function remoteLogo(guid: string): Promise<string | null> {
  let logo = cache.get(guid);
  if (!logo) {
    logo = api.remoteLogo(guid).catch(() => null);
    cache.set(guid, logo);
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

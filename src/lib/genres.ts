// Plex renvoie la plupart des genres en anglais : on les affiche en français.
const FR: Record<string, string> = {
  "Action & Adventure": "Action & Aventure",
  Adventure: "Aventure",
  Anime: "Animé",
  Biography: "Biographie",
  Children: "Enfants",
  Kids: "Enfants",
  Comedy: "Comédie",
  Crime: "Policier",
  Documentary: "Documentaire",
  Drama: "Drame",
  Family: "Famille",
  Fantasy: "Fantastique",
  "Film-Noir": "Film noir",
  "Food": "Cuisine",
  "Game Show": "Jeu télévisé",
  History: "Histoire",
  "Home and Garden": "Maison & jardin",
  Horror: "Horreur",
  "Martial Arts": "Arts martiaux",
  "Mini-Series": "Mini-série",
  Music: "Musique",
  Musical: "Comédie musicale",
  Mystery: "Mystère",
  News: "Actualités",
  Reality: "Téléréalité",
  "Sci-Fi & Fantasy": "SF & Fantastique",
  "Science Fiction": "Science-fiction",
  "Science-Fiction": "Science-fiction",
  Short: "Court métrage",
  Soap: "Feuilleton",
  Suspense: "Suspense",
  Talk: "Talk-show",
  Travel: "Voyage",
  "TV Movie": "Téléfilm",
  War: "Guerre",
  "War & Politics": "Guerre & politique",
};

export function genreLabel(title: string): string {
  return FR[title] ?? title;
}

// Teinte stable par genre, pour que chaque tuile garde sa couleur.
const HUES = [12, 28, 45, 150, 175, 195, 215, 235, 260, 285, 310, 335];

export function genreHue(title: string): number {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

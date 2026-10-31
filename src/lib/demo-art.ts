// Visuels de démonstration générés à la volée (SVG) : affiches, scènes, pochettes, portraits.
// Aucun visuel réel n'est utilisé, ce qui permet de publier des captures de l'interface librement.

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Générateur pseudo-aléatoire déterministe : un même titre donne toujours la même image. */
function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Paysage stylisé (coucher de soleil, montagnes, étoiles, vagues ou anneaux). */
function landscape(seed: string, w: number, h: number): { defs: string; body: string; hue: number } {
  const r = rng(seed);
  const hue = Math.floor(r() * 360);
  const hue2 = (hue + 40 + r() * 80) % 360;
  const style = Math.floor(r() * 4);
  const id = `g${hash(seed)}`;
  const defs = `
    <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 55% 12%)"/>
      <stop offset="0.6" stop-color="hsl(${hue2} 65% 38%)"/>
      <stop offset="1" stop-color="hsl(${hue2 + 20} 80% 62%)"/>
    </linearGradient>
    <radialGradient id="${id}s"><stop offset="0" stop-color="hsl(${hue2 + 30} 100% 85%)"/><stop offset="1" stop-color="hsl(${hue2 + 30} 100% 70%)" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#${id})"/>`;
  for (let i = 0; i < 40; i++) {
    body += `<circle cx="${r() * w}" cy="${r() * h * 0.5}" r="${r() * 1.6 + 0.3}" fill="#fff" opacity="${r() * 0.7}"/>`;
  }
  const sx = w * (0.25 + r() * 0.5);
  const sy = h * (0.38 + r() * 0.12);
  const sr = Math.min(w, h) * (0.12 + r() * 0.08);
  body += `<circle cx="${sx}" cy="${sy}" r="${sr * 2.4}" fill="url(#${id}s)" opacity="0.6"/>`;
  if (style === 3) {
    // Planète et ses anneaux.
    body += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="hsl(${hue2} 70% 72%)"/>`;
    body += `<ellipse cx="${sx}" cy="${sy}" rx="${sr * 1.9}" ry="${sr * 0.45}" fill="none" stroke="hsl(${hue2 + 40} 90% 85%)" stroke-width="${sr * 0.12}" opacity="0.8" transform="rotate(-14 ${sx} ${sy})"/>`;
  } else {
    body += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="hsl(${hue2 + 30} 100% 80%)"/>`;
  }
  if (style === 1) {
    // Mer et reflets.
    const sea = h * 0.62;
    body += `<rect y="${sea}" width="${w}" height="${h - sea}" fill="hsl(${hue} 60% 14%)"/>`;
    for (let i = 0; i < 9; i++) {
      const y = sea + (h - sea) * (i / 9) + 4;
      body += `<rect x="${sx - sr * (1.2 - i * 0.1)}" y="${y}" width="${sr * (2.4 - i * 0.2)}" height="${2 + i * 0.4}" rx="2" fill="hsl(${hue2 + 30} 100% 80%)" opacity="${0.7 - i * 0.06}"/>`;
    }
  } else if (style === 2) {
    // Grille néon en perspective.
    const hz = h * 0.6;
    body += `<rect y="${hz}" width="${w}" height="${h - hz}" fill="hsl(${hue} 70% 8%)"/>`;
    for (let i = 0; i <= 12; i++) {
      const x = (w / 12) * i;
      body += `<line x1="${w / 2 + (x - w / 2) * 0.15}" y1="${hz}" x2="${x * 2.2 - w * 0.6}" y2="${h}" stroke="hsl(${hue2 + 60} 100% 65%)" stroke-width="1.2" opacity="0.7"/>`;
    }
    for (let i = 1; i < 8; i++) {
      const y = hz + (h - hz) * Math.pow(i / 8, 1.8);
      body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="hsl(${hue2 + 60} 100% 65%)" stroke-width="1.2" opacity="0.6"/>`;
    }
  } else {
    // Chaînes de montagnes superposées.
    for (let layer = 0; layer < 3; layer++) {
      const base = h * (0.55 + layer * 0.12);
      let pts = `0,${h} `;
      const steps = 7 + layer * 2;
      for (let i = 0; i <= steps; i++) {
        pts += `${(w / steps) * i},${base - r() * h * (0.22 - layer * 0.05)} `;
      }
      pts += `${w},${h}`;
      body += `<polygon points="${pts}" fill="hsl(${hue} 45% ${6 + layer * 5}%)" opacity="${0.75 + layer * 0.12}"/>`;
    }
  }
  return { defs, body, hue: hue2 };
}

/** Affiche verticale avec titre. */
export function poster(title: string, tagline = ""): string {
  const w = 400;
  const h = 600;
  const { defs, body, hue } = landscape(title, w, h);
  const size = title.length > 16 ? 34 : title.length > 10 ? 42 : 52;
  const lines = title.length > 16 ? splitTitle(title) : [title];
  const text = lines
    .map(
      (l, i) =>
        `<text x="${w / 2}" y="${h - 70 - (lines.length - 1 - i) * size * 1.05}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${size}" letter-spacing="2" fill="#fff">${escape(l.toUpperCase())}</text>`,
    )
    .join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <defs>${defs}<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs>
    ${body}<rect width="${w}" height="${h}" fill="url(#fade)"/>
    ${text}
    <text x="${w / 2}" y="${h - 32}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" letter-spacing="4" fill="hsl(${hue} 90% 80%)">${escape(tagline.toUpperCase())}</text>
  </svg>`);
}

function splitTitle(title: string): string[] {
  const words = title.split(" ");
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

/** Scène en 16:9 (fond de fiche, vignette d'épisode). */
export function scene(seed: string, w = 1280, h = 720): string {
  const { defs, body } = landscape(seed, w, h);
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`);
}

/** Pochette d'album carrée, motif géométrique. */
export function cover(title: string, artist: string): string {
  const r = rng(title + artist);
  const hue = Math.floor(r() * 360);
  const s = 400;
  let shapes = "";
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    for (let i = 9; i > 0; i--) {
      shapes += `<circle cx="${s / 2}" cy="${s / 2}" r="${i * 22}" fill="hsl(${(hue + i * 14) % 360} 70% ${18 + i * 6}%)"/>`;
    }
  } else if (kind === 1) {
    for (let i = 0; i < 12; i++) {
      shapes += `<rect x="0" y="${i * 34}" width="${s}" height="18" fill="hsl(${(hue + i * 9) % 360} 75% ${30 + (i % 4) * 10}%)" transform="rotate(-20 ${s / 2} ${s / 2})"/>`;
    }
  } else {
    for (let i = 0; i < 14; i++) {
      shapes += `<polygon points="${r() * s},${r() * s} ${r() * s},${r() * s} ${r() * s},${r() * s}" fill="hsl(${(hue + r() * 80) % 360} 80% ${35 + r() * 30}%)" opacity="0.75"/>`;
    }
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" fill="hsl(${hue} 50% 12%)"/>${shapes}
    <rect y="${s - 70}" width="${s}" height="70" fill="#000" opacity="0.45"/>
    <text x="20" y="${s - 40}" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="20" fill="#fff">${escape(title)}</text>
    <text x="20" y="${s - 16}" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#fffb">${escape(artist)}</text>
  </svg>`);
}

/** Portrait abstrait avec initiales. */
export function avatar(name: string): string {
  const r = rng(name);
  const hue = Math.floor(r() * 360);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${hue + 50} 70% 30%)"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#a)"/>
    <circle cx="100" cy="82" r="34" fill="#fff" opacity="0.25"/><ellipse cx="100" cy="190" rx="66" ry="56" fill="#fff" opacity="0.25"/>
    <text x="100" y="118" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="56" fill="#fff">${escape(initials)}</text>
  </svg>`);
}

/** Logo de plateforme fictive. */
export function logo(letter: string, hue: number): string {
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 70% 45%)"/><text x="32" y="44" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="34" fill="#fff">${letter}</text></svg>`);
}

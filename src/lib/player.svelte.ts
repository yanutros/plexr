import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { untrack } from "svelte";
import type { QueueTrack } from "./api";
import { t } from "./i18n";

export interface MpvTrack {
  id: number;
  type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  codec?: string;
  "demux-channel-count"?: number;
  external?: boolean;
  forced?: boolean;
}

/**
 * État du lecteur. Sur ordinateur, il est alimenté par les propriétés que mpv publie ;
 * sur mobile et TV (`web`), par le lecteur vidéo / audio du système, piloté ici même.
 */
export const player = $state({
  /** Une lecture est en cours (vidéo ou musique). */
  active: false,
  /** Vidéo plein cadre, sinon musique avec la barre du bas. */
  video: false,
  /** Vidéo dessinée dans la fenêtre de Plexr (Windows) ; sinon dans une fenêtre mpv séparée. */
  embedded: true,
  /** Lecture par le lecteur intégré du système (Android, iOS) plutôt que par mpv. */
  web: false,
  /** Identifiant de la lecture : les événements d'une lecture remplacée sont ignorés. */
  session: "",
  /** Vidéo en cours et épisodes voisins (pour les boutons précédent / suivant). */
  ratingKey: "",
  prevKey: null as string | null,
  nextKey: null as string | null,
  title: "",
  subtitle: null as string | null,
  position: 0,
  duration: 0,
  bufferedUntil: 0,
  paused: false,
  buffering: true,
  volume: 100,
  muted: false,
  tracks: [] as MpvTrack[],
  aid: null as number | null,
  sid: null as number | null,
  /** File de lecture musicale et titre en cours. */
  queue: [] as QueueTrack[],
  index: 0,
  repeat: false,
  /** Vue « En cours de lecture » ouverte. */
  expanded: false,
  /** Incrémenté à chaque saut dans le morceau (pour la notification Android). */
  seeks: 0,
});

export const current = () => (player.video ? null : (player.queue[player.index] ?? null));

// Sur Android et iOS, mpv n'existe pas : le lecteur du système prend le relais.
invoke<string | null>("platform").then(
  (os) => (player.web = os === "android" || os === "ios"),
  () => {},
);

export interface PlayOptions {
  /** Identifiants de pistes Plex ; `subtitleStream: 0` désactive les sous-titres. */
  audioStream?: number | null;
  subtitleStream?: number | null;
  fromStart?: boolean;
}

function reset(video: boolean) {
  web.teardown();
  Object.assign(player, {
    active: true,
    video,
    embedded: true,
    session: "",
    ratingKey: "",
    prevKey: null,
    nextKey: null,
    title: "",
    subtitle: null,
    buffering: true,
    position: 0,
    duration: 0,
    bufferedUntil: 0,
    paused: false,
    tracks: [],
    queue: [],
    index: 0,
    repeat: false,
    expanded: false,
  });
}

export async function play(ratingKey: string, opts: PlayOptions = {}) {
  reset(true);
  player.ratingKey = ratingKey;
  // Épisodes voisins, chargés à part : la lecture démarre sans les attendre.
  invoke<{ prev: string | null; next: string | null }>("plex_adjacent", { ratingKey }).then(
    (a) => {
      if (player.ratingKey === ratingKey) Object.assign(player, { prevKey: a.prev, nextKey: a.next });
    },
    () => {},
  );
  const streams = {
    audioStream: opts.audioStream ?? null,
    subtitleStream: opts.subtitleStream ?? null,
  };
  try {
    if (player.web) {
      const s = await invoke<{
        session: string;
        url: string;
        title: string;
        subtitle: string | null;
        offsetMs: number;
        durationMs: number;
      }>("video_stream", { ratingKey, ...streams });
      Object.assign(player, { session: s.session, title: s.title, subtitle: s.subtitle, duration: s.durationMs / 1000 });
      web.startVideo(s.url, opts.fromStart ? 0 : s.offsetMs / 1000);
      return;
    }
    const now = await invoke<{ session: string; title: string; subtitle: string | null; embedded: boolean }>("play", {
      ratingKey,
      ...streams,
      fromStart: opts.fromStart ?? false,
    });
    Object.assign(player, now);
  } catch (e) {
    player.active = false;
    throw e;
  }
}

/**
 * Joue un artiste, un album, une playlist ou un titre ; `start` : titre par lequel commencer ;
 * `keys` : une sélection de titres à enchaîner (par ex. « Titres du moment »).
 */
export async function playMusic(
  ratingKey: string,
  opts: { start?: string; shuffle?: boolean; keys?: string[] } = {},
) {
  const wasExpanded = player.expanded && !player.video;
  reset(false);
  player.expanded = wasExpanded;
  try {
    const q = await invoke<{ session: string; tracks: QueueTrack[]; index: number }>(
      player.web ? "music_queue" : "play_music",
      {
        ratingKey,
        keys: opts.keys ?? null,
        start: opts.start ?? null,
        shuffle: opts.shuffle ?? false,
      },
    );
    player.session = q.session;
    player.queue = q.tracks;
    player.index = q.index;
    player.duration = (q.tracks[q.index]?.durationMs ?? 0) / 1000;
    if (player.web) web.playTrack(q.index);
  } catch (e) {
    player.active = false;
    throw e;
  }
}

/** Commande au lecteur, au format mpv (par ex. `["cycle", "pause"]`), quel que soit le moteur. */
export function mpv(...args: unknown[]) {
  if (player.web) return Promise.resolve(web.command(args));
  return invoke<void>("player_command", { args }).catch(() => {});
}

export function stop() {
  if (player.web) web.teardown();
  else invoke("player_stop");
  player.active = false;
  player.expanded = false;
}

/** Titre précédent, ou retour au début du titre s'il joue depuis plus de 3 s. */
export function previous() {
  if (player.position > 3 || player.index === 0) mpv("seek", 0, "absolute");
  else mpv("playlist-prev");
}

export function next() {
  mpv("playlist-next");
}

export function trackLabel(track: MpvTrack): string {
  const parts = [track.title, track.lang?.toUpperCase()].filter(Boolean);
  if (track.type === "audio" && track["demux-channel-count"])
    parts.push(t("player.channels", { channels: track["demux-channel-count"] }));
  if (track.forced) parts.push(t("player.forced"));
  return parts.length ? parts.join(" · ") : t("player.trackNumber", { id: track.id });
}

// ---------- Lecteur intégré du système (mobile, TV) ----------

/** Lecture par les éléments <video> / <audio> de la page, avec le suivi Plex. */
const web = (() => {
  let media: HTMLMediaElement | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let hls: { destroy(): void } | null = null;
  let pending: { url: string; offset: number } | null = null;
  let reportTimer: ReturnType<typeof setInterval> | undefined;
  let reportedKey = "";
  let unbind: (() => void) | null = null;

  const key = () => (player.video ? player.ratingKey : (player.queue[player.index]?.ratingKey ?? ""));

  function report(state: "playing" | "paused" | "stopped", ratingKey = key()) {
    if (!ratingKey) return;
    invoke("report_timeline", {
      ratingKey,
      playback: state,
      timeMs: Math.round(player.position * 1000),
      durationMs: Math.round(player.duration * 1000),
    }).catch(() => {});
  }

  function bind(el: HTMLMediaElement) {
    unbind?.();
    const on: [string, () => void][] = [
      ["timeupdate", () => ((player.position = el.currentTime), (player.buffering = false))],
      ["durationchange", () => Number.isFinite(el.duration) && el.duration > 0 && (player.duration = el.duration)],
      ["play", () => (player.paused = false)],
      ["pause", () => ((player.paused = true), report("paused"))],
      ["waiting", () => (player.buffering = true)],
      ["playing", () => (player.buffering = false)],
      ["volumechange", () => ((player.volume = Math.round(el.volume * 100)), (player.muted = el.muted))],
      ["progress", () => el.buffered.length && (player.bufferedUntil = el.buffered.end(el.buffered.length - 1))],
      ["seeked", () => player.seeks++],
      ["ended", ended],
    ];
    for (const [ev, fn] of on) el.addEventListener(ev, fn);
    unbind = () => on.forEach(([ev, fn]) => el.removeEventListener(ev, fn));
    media = el;
    clearInterval(reportTimer);
    reportTimer = setInterval(() => report(player.paused ? "paused" : "playing"), 10000);
  }

  function ended() {
    if (player.video) {
      stop();
      return;
    }
    if (player.index < player.queue.length - 1) playTrack(player.index + 1);
    else if (player.repeat) playTrack(0);
    else stop();
  }

  async function load(el: HTMLVideoElement, url: string, offset: number) {
    el.addEventListener("loadedmetadata", () => offset > 0 && (el.currentTime = offset), { once: true });
    // Le lecteur d'Android et d'iOS lit le HLS nativement ; sinon hls.js s'en charge.
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
    } else {
      const { default: Hls } = await import("hls.js");
      const h = new Hls();
      h.loadSource(url);
      h.attachMedia(el);
      hls = h;
    }
    el.play().catch(() => {});
  }

  return {
    /** L'élément <video> du lecteur plein écran s'enregistre ici à son affichage. */
    attachVideo(el: HTMLVideoElement) {
      videoEl = el;
      bind(el);
      if (pending) {
        load(el, pending.url, pending.offset);
        pending = null;
      }
    },

    startVideo(url: string, offset: number) {
      reportedKey = player.ratingKey;
      if (videoEl) {
        bind(videoEl);
        load(videoEl, url, offset);
      } else {
        pending = { url, offset };
      }
    },

    playTrack(index: number) {
      if (reportedKey && reportedKey !== player.queue[index]?.ratingKey) report("stopped", reportedKey);
      const t = player.queue[index];
      if (!t) return;
      Object.assign(player, { index, position: 0, duration: t.durationMs / 1000, buffering: true });
      reportedKey = t.ratingKey;
      audioEl ??= new Audio();
      if (media !== audioEl) bind(audioEl);
      audioEl.src = t.url;
      audioEl.play().catch(() => {});
    },

    /** Traduit les commandes au format mpv pour l'élément <video> / <audio>. */
    command(args: unknown[]) {
      const el = media;
      const [cmd, a, b] = args as [string, unknown, unknown];
      if (!el) return;
      switch (cmd) {
        case "cycle":
          if (a === "pause") (el.paused ? el.play().catch(() => {}) : el.pause());
          else if (a === "mute") el.muted = !el.muted;
          break;
        case "seek":
          el.currentTime = Math.max(0, b === "absolute" ? Number(a) : el.currentTime + Number(a));
          break;
        case "add":
          if (a === "volume") el.volume = Math.min(1, Math.max(0, el.volume + Number(b) / 100));
          break;
        case "set_property":
          if (a === "volume") el.volume = Math.min(1, Number(b) / 100);
          else if (a === "mute") el.muted = !!b;
          else if (a === "playlist-pos") playTrack(Number(b));
          else if (a === "loop-playlist") player.repeat = b !== "no";
          break;
        case "playlist-next":
          if (player.index < player.queue.length - 1) playTrack(player.index + 1);
          else if (player.repeat) playTrack(0);
          break;
        case "playlist-prev":
          if (player.index > 0) playTrack(player.index - 1);
          break;
      }
    },

    /** Arrête tout : dernière progression envoyée, conversion du serveur libérée. */
    teardown() {
      if (reportedKey) report("stopped", reportedKey);
      reportedKey = "";
      clearInterval(reportTimer);
      unbind?.();
      unbind = null;
      hls?.destroy();
      hls = null;
      pending = null;
      for (const el of [videoEl, audioEl]) {
        if (!el) continue;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      if (player.web && player.video && player.session) {
        invoke("stop_transcode", { session: player.session }).catch(() => {});
      }
      media = null;
    },

    detachVideo() {
      videoEl = null;
    },
  };

  function playTrack(index: number) {
    web.playTrack(index);
  }
})();

export const attachVideo = (el: HTMLVideoElement) => web.attachVideo(el);
export const detachVideo = () => web.detachVideo();

// ---------- Événements de mpv (ordinateur) ----------

listen<{ name: string; data: unknown }>("player-prop", ({ payload: { name, data } }) => {
  switch (name) {
    case "time-pos":
      if (typeof data === "number") {
        player.position = data;
        player.buffering = false;
      }
      break;
    case "duration":
      if (typeof data === "number") player.duration = data;
      break;
    case "pause":
      player.paused = !!data;
      break;
    case "paused-for-cache":
      player.buffering = !!data;
      break;
    case "demuxer-cache-time":
      player.bufferedUntil = (data as number) ?? 0;
      break;
    case "volume":
      player.volume = (data as number) ?? 100;
      break;
    case "mute":
      player.muted = !!data;
      break;
    case "track-list":
      player.tracks = (data as MpvTrack[]) ?? [];
      break;
    case "aid":
      player.aid = typeof data === "number" ? data : null;
      break;
    case "sid":
      player.sid = typeof data === "number" ? data : null;
      break;
    case "playlist-pos":
      if (typeof data === "number" && data >= 0 && data < player.queue.length && data !== player.index) {
        player.index = data;
        player.position = 0;
        player.duration = player.queue[data].durationMs / 1000;
      }
      break;
    case "loop-playlist":
      player.repeat = data !== false && data !== "no";
      break;
  }
});

// Une lecture remplacée signale sa fin après le démarrage de la suivante : on l'ignore.
listen<string>("player-stopped", ({ payload }) => {
  if (payload === player.session) {
    player.active = false;
    player.expanded = false;
  }
});

// ---------- Android : musique dans la notification ----------

/**
 * Sur Android, la musique jouée dans la page s'affiche dans une notification (pochette, titre,
 * précédent / lecture / suivant) qui la garde aussi en vie en arrière-plan : voir MediaService.kt.
 * Ses commandes reviennent ici par `window.__plexrMedia`.
 */
const android = (globalThis as { PlexrDevice?: { mediaUpdate?(json: string): void; mediaStop?(): void } }).PlexrDevice;
if (android?.mediaUpdate) {
  $effect.root(() => {
    $effect(() => {
      void player.seeks;
      const track = current();
      if (!player.active || !player.web || !track) {
        android.mediaStop?.();
        return;
      }
      android.mediaUpdate!(
        JSON.stringify({
          title: track.title,
          artist: track.artist ?? "",
          album: track.album ?? "",
          art: track.cover ?? "",
          playing: !player.paused,
          position: Math.round(untrack(() => player.position) * 1000),
          duration: Math.round(player.duration * 1000),
        }),
      );
    });
  });

  (globalThis as { __plexrMedia?: (action: string) => void }).__plexrMedia = (action) => {
    if (action === "play" || action === "pause") {
      if (player.paused === (action === "play")) mpv("cycle", "pause");
    } else if (action === "next") next();
    else if (action === "previous") previous();
    else if (action === "stop") stop();
    else if (action.startsWith("seek:")) mpv("seek", Number(action.slice(5)) / 1000, "absolute");
  };
}

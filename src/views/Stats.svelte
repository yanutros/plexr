<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api, errorText, formatClock, formatLongDuration, tracearrLogin, type Session, type TracearrDashboard } from "../lib/api";
  import { genreLabel } from "../lib/genres";
  import { go } from "../lib/nav.svelte";
  import Icon from "../components/Icon.svelte";

  let { session, onChange }: { session: Session; onChange: () => void } = $props();

  let data = $state<TracearrDashboard | null>(null);
  let error = $state<string | null>(null);
  let needsLogin = $state(false);
  let connecting = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function load() {
    try {
      data = await api.tracearrDashboard();
      needsLogin = false;
      error = null;
    } catch (e) {
      const message = errorText(e);
      if (message.includes("SESSION_EXPIRED")) {
        needsLogin = true;
        onChange();
      } else {
        error = message;
      }
    }
  }

  async function connect() {
    connecting = true;
    error = null;
    try {
      await tracearrLogin();
      onChange();
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      connecting = false;
    }
  }

  // Variation par rapport aux 30 jours précédents.
  function delta(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  function longDate(iso: string): string {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  // « il y a 1 an et 10 mois ».
  function since(iso: string): string {
    const months = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / (30.44 * 86_400_000)));
    const y = Math.floor(months / 12);
    const m = months % 12;
    const parts = [y ? `${y} an${y > 1 ? "s" : ""}` : "", m ? `${m} mois` : ""].filter(Boolean);
    return parts.length ? `il y a ${parts.join(" et ")}` : "ce mois-ci";
  }

  const hours = (ms: number) => Math.round(ms / 3_600_000).toLocaleString("fr-FR");

  const kpis = $derived(
    data
      ? [
          {
            icon: "clock" as const,
            label: "devant l'écran",
            value: formatLongDuration(data.month.watchMs),
            hint: data.month.listenMs ? `dont ${formatLongDuration(data.month.listenMs)} de musique` : null,
            delta: delta(data.month.watchMs, data.previous.watchMs),
          },
          {
            icon: "play" as const,
            label: "lectures",
            value: data.month.plays.toLocaleString("fr-FR"),
            hint: null,
            delta: delta(data.month.plays, data.previous.plays),
          },
          {
            icon: "film" as const,
            label: "titres différents",
            value: data.month.titles.toLocaleString("fr-FR"),
            hint: null,
            delta: delta(data.month.titles, data.previous.titles),
          },
        ]
      : [],
  );

  // Fond d'ambiance : l'affiche du titre le plus regardé.
  const ambient = $derived(data?.topTitles[0]?.poster ?? data?.bingeArt?.backdrop ?? null);
  const genres = $derived(data?.allTime.topGenres?.slice(0, 5) ?? []);
  const maxGenre = $derived(Math.max(1, ...genres.map((g) => g.plays)));

  onMount(() => {
    if (session.tracearrUrl && session.tracearrConnected) {
      load();
      // La lecture en cours se rafraîchit toutes les 15 s.
      timer = setInterval(load, 15000);
    } else {
      needsLogin = !!session.tracearrUrl;
    }
  });

  onDestroy(() => clearInterval(timer));
</script>

{#if !session.tracearrUrl || needsLogin || (error && !data) || !data}
  <div class="page">
    <h1 class="row-title page-title">Mes statistiques</h1>
    {#if !session.tracearrUrl}
      <div class="empty">
        <p>Indique l'adresse de ton Tracearr dans les Réglages pour voir tes statistiques.</p>
        <button class="btn primary" onclick={() => go({ name: "settings" })}>Ouvrir les Réglages</button>
      </div>
    {:else if needsLogin}
      <div class="empty">
        <p>Connecte-toi à Tracearr avec ton compte Plex. Ton navigateur va s'ouvrir pour valider l'accès.</p>
        <button class="btn primary" disabled={connecting} onclick={connect}>
          {connecting ? "En attente de validation dans le navigateur…" : "Se connecter avec Plex"}
        </button>
        {#if error}<p class="error">{error}</p>{/if}
      </div>
    {:else if error}
      <p class="error">{error}</p>
    {:else}
      <div class="skeleton" style:height="320px"></div>
    {/if}
  </div>
{:else}
  <!-- Bandeau d'ambiance : affiche du titre le plus regardé, très floutée. -->
  <section class="hero">
    {#if ambient}<div class="ambient" style:background-image={`url("${ambient}")`}></div>{/if}
    <div class="hero-shade"></div>
    <div class="hero-body">
      <div class="eyebrow">Tes 30 derniers jours</div>
      <h1>Bonjour {data.username ?? ""}</h1>
      <p class="lead">
        {formatLongDuration(data.month.watchMs)} devant l'écran, {data.month.titles} titres découverts ou revus.
      </p>
      <div class="kpis">
        {#each kpis as k (k.label)}
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-icon"><Icon name={k.icon} size={16} /></span>
              {#if k.delta !== null}
                <span class="pill" class:up={k.delta >= 0}>
                  {k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta)} %
                </span>
              {/if}
            </div>
            <div class="kpi-value">{k.value}</div>
            <div class="kpi-label">{k.label}{k.hint ? ` · ${k.hint}` : ""}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <div class="page content">
    {#if data.nowPlaying.length}
      <h2 class="section"><span class="live"></span>En ce moment</h2>
      <div class="now">
        {#each data.nowPlaying as s, i (i)}
          <div class="session">
            {#if s.poster}<div class="session-bg" style:background-image={`url("${s.poster}")`}></div>{/if}
            <div class="session-poster">{#if s.poster}<img src={s.poster} alt="" />{:else}<Icon name="music" size={28} />{/if}</div>
            <div class="session-body">
              <div class="s-title">{s.title}</div>
              {#if s.subtitle}<div class="s-sub">{s.subtitle}</div>{/if}
              <div class="bar"><div style:width="{s.durationMs ? (s.progressMs / s.durationMs) * 100 : 0}%"></div></div>
              <div class="s-meta">
                <span>{s.paused ? "En pause" : "En lecture"} · {formatClock(s.progressMs / 1000)} / {formatClock(s.durationMs / 1000)}</span>
                <span>{[s.player, s.local ? "Réseau local" : "À distance", s.decision === "transcode" ? "Transcodage" : "Direct"].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if data.topTitles.length}
      <h2 class="section">Ton top 10 <span class="muted">30 derniers jours</span></h2>
      <div class="top">
        {#each data.topTitles as t (t.rank + t.title)}
          <button
            class="chart"
            disabled={!t.ratingKey}
            onclick={() => t.ratingKey && go({ name: "item", ratingKey: t.ratingKey })}
          >
            <span class="rank">{t.rank}</span>
            <span class="chart-poster">{#if t.poster}<img src={t.poster} alt="" loading="lazy" />{/if}</span>
            <span class="chart-name">{t.title}</span>
            <span class="chart-sub">
              {t.episodes ? `${t.episodes} épisode${t.episodes > 1 ? "s" : ""}` : `${t.plays} lecture${t.plays > 1 ? "s" : ""}`}
              · {formatLongDuration(t.watchMs)}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <h2 class="section">Depuis toujours</h2>
    <div class="bento">
      {#if data.allTime.totalWatchTimeMs}
        <div class="tile total">
          <div class="tile-label"><Icon name="clock" size={16} /> Temps de visionnage</div>
          <div class="huge">{formatLongDuration(data.allTime.totalWatchTimeMs)}</div>
          <div class="tile-foot">
            soit {hours(data.allTime.totalWatchTimeMs)} heures
            {#if data.allTime.daysWatched}· réparties sur {data.allTime.daysWatched} jours{/if}
          </div>
        </div>
      {/if}

      {#if data.allTime.longestStreak}
        <div class="tile streak">
          <div class="tile-label"><span class="flame">🔥</span> Plus longue série</div>
          <div class="big">{data.allTime.longestStreak} <small>jours d'affilée</small></div>
          <div class="tile-foot">
            {#if data.allTime.currentStreak}
              <span class="pill up">En cours : {data.allTime.currentStreak} jour{data.allTime.currentStreak > 1 ? "s" : ""}</span>
            {:else}
              Aucune série en cours
            {/if}
          </div>
        </div>
      {/if}

      {#if genres.length}
        <div class="tile genres">
          <div class="tile-label"><Icon name="stats" size={16} /> Genres préférés</div>
          <div class="bars">
            {#each genres as g, i (g.genre)}
              <div class="bar-row">
                <div class="bar-head"><span>{genreLabel(g.genre)}</span><span class="dim">{g.plays}</span></div>
                <div class="bar-track"><div class="bar-fill" style:width="{(g.plays / maxGenre) * 100}%" style:--i={i}></div></div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if data.allTime.biggestBinge}
        <button
          class="tile art binge"
          disabled={!data.bingeArt}
          onclick={() => data?.bingeArt && go({ name: "item", ratingKey: data.bingeArt.ratingKey })}
        >
          {#if data.bingeArt?.backdrop}<span class="art-bg" style:background-image={`url("${data.bingeArt.backdrop}")`}></span>{/if}
          <span class="art-shade"></span>
          <span class="art-body">
            <span class="tile-label">Plus gros marathon</span>
            <span class="big">{data.allTime.biggestBinge.episodes} <small>épisodes en une journée</small></span>
            <span class="art-title">{data.allTime.biggestBinge.showTitle}</span>
            <span class="tile-foot">{longDate(data.allTime.biggestBinge.day)}</span>
          </span>
        </button>
      {/if}

      {#if data.allTime.firstPlay}
        <button
          class="tile art first"
          disabled={!data.firstPlayArt}
          onclick={() => data?.firstPlayArt && go({ name: "item", ratingKey: data.firstPlayArt.ratingKey })}
        >
          {#if data.firstPlayArt?.backdrop}<span class="art-bg" style:background-image={`url("${data.firstPlayArt.backdrop}")`}></span>{/if}
          <span class="art-shade"></span>
          <span class="art-body">
            <span class="tile-label">Ta toute première lecture</span>
            <span class="art-title">{data.allTime.firstPlay.grandparentTitle ?? data.allTime.firstPlay.mediaTitle}</span>
            <span class="tile-foot">{longDate(data.allTime.firstPlay.startedAt)} · {since(data.allTime.firstPlay.startedAt)}</span>
          </span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .empty {
    display: grid;
    justify-items: start;
    gap: 14px;
    max-width: 560px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
  }

  .empty p {
    margin: 0;
  }

  /* ---------- Bandeau ---------- */

  .hero {
    position: relative;
    margin-top: -68px;
    padding: 120px 40px 36px;
    overflow: hidden;
  }

  .ambient {
    position: absolute;
    inset: -60px;
    background-size: cover;
    background-position: center 30%;
    filter: blur(60px) saturate(1.6);
    opacity: 0.55;
    transform: scale(1.1);
  }

  .hero-shade {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(80% 120% at 10% 0%, transparent 0%, #14151880 60%),
      linear-gradient(#14151800 40%, var(--bg) 100%);
  }

  .hero-body {
    position: relative;
  }

  .eyebrow {
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 6px 0 6px;
    font-size: 46px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .lead {
    margin: 0;
    max-width: 640px;
    color: #ffffffc8;
    font-size: 17px;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 28px;
  }

  .kpi {
    padding: 18px 20px;
    border: 1px solid #ffffff1c;
    border-radius: 20px;
    background: #ffffff0f;
    backdrop-filter: blur(24px) saturate(1.4);
    box-shadow: 0 10px 30px #0004;
  }

  .kpi-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .kpi-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }

  .kpi-value {
    margin-top: 14px;
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .kpi-label {
    margin-top: 6px;
    color: #ffffffa8;
    font-size: 13px;
  }

  .pill {
    padding: 3px 9px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    color: var(--danger);
    font-size: 12px;
    font-weight: 700;
  }

  .pill.up {
    background: color-mix(in srgb, var(--ok) 18%, transparent);
    color: var(--ok);
  }

  /* ---------- Contenu ---------- */

  .content {
    padding-top: 0;
  }

  .section {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 36px 0 16px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .section .muted {
    font-size: 14px;
    font-weight: 500;
  }

  .live {
    align-self: center;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff453a;
    box-shadow: 0 0 0 0 #ff453a88;
    animation: pulse 1.6s infinite;
  }

  @keyframes pulse {
    70% {
      box-shadow: 0 0 0 10px #ff453a00;
    }
  }

  .now {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
    gap: 16px;
  }

  .session {
    position: relative;
    display: flex;
    gap: 18px;
    padding: 16px;
    overflow: hidden;
    border: 1px solid #ffffff17;
    border-radius: 20px;
    background: var(--bg-elev);
  }

  .session-bg {
    position: absolute;
    inset: -40px;
    background-size: cover;
    background-position: center;
    filter: blur(40px) saturate(1.5);
    opacity: 0.35;
  }

  .session-poster {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 72px;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 10px;
    background: #ffffff12;
    color: var(--text-faint);
  }

  .session-poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .session-body {
    position: relative;
    flex: 1;
    min-width: 0;
    align-self: center;
  }

  .s-title {
    font-size: 17px;
    font-weight: 700;
  }

  .s-sub {
    color: #ffffffb0;
    font-size: 13px;
  }

  .bar {
    height: 5px;
    margin: 14px 0 8px;
    overflow: hidden;
    border-radius: 3px;
    background: #ffffff1f;
  }

  .bar div {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }

  .s-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 12px;
    color: #ffffff99;
    font-size: 12px;
  }

  /* Top 10 : grand numéro en relief derrière chaque affiche. */
  .top {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 210px;
    gap: 8px;
    overflow-x: auto;
    padding: 6px 4px 16px;
    margin: -6px -4px 0;
  }

  .chart {
    position: relative;
    display: grid;
    padding: 0 0 0 58px;
    border: none;
    background: none;
    text-align: left;
  }

  .chart:disabled {
    cursor: default;
  }

  .rank {
    position: absolute;
    left: -4px;
    bottom: 40px;
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-size: 150px;
    font-weight: 900;
    line-height: 0.8;
    letter-spacing: -0.08em;
    color: var(--bg);
    -webkit-text-stroke: 3px #ffffff40;
    transition: -webkit-text-stroke-color 0.2s;
  }

  .chart:not(:disabled):hover .rank {
    -webkit-text-stroke-color: var(--accent);
  }

  .chart-poster {
    position: relative;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 12px;
    background: var(--bg-hover);
    box-shadow: -10px 10px 24px #000a;
    transition: transform 0.25s var(--ease);
  }

  .chart:not(:disabled):hover .chart-poster {
    transform: translateY(-4px);
  }

  .chart-poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .chart-name {
    margin-top: 10px;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chart-sub {
    color: var(--text-dim);
    font-size: 12px;
  }

  /* ---------- Depuis toujours : mosaïque de cartes ---------- */

  .bento {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: 200px;
    gap: 16px;
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 22px;
    overflow: hidden;
    border: 1px solid #ffffff14;
    border-radius: 22px;
    background: var(--bg-elev);
    text-align: left;
  }

  .tile-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffffb8;
    font-size: 13px;
    font-weight: 600;
  }

  .tile-foot {
    color: #ffffffa0;
    font-size: 13px;
  }

  .huge {
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-size: 64px;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .big {
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .big small {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0;
    color: #ffffffc0;
  }

  .total {
    grid-column: span 2;
    background:
      radial-gradient(120% 140% at 100% 0%, #e5a00d55 0%, transparent 55%),
      linear-gradient(135deg, #2a2216, #1a1b1f);
  }

  .total .huge {
    background: linear-gradient(90deg, #fff, #ffd27a);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }

  .streak {
    background:
      radial-gradient(120% 120% at 0% 100%, #ff6b3555 0%, transparent 60%),
      linear-gradient(160deg, #2a1a17, #1a1b1f);
  }

  .flame {
    font-size: 15px;
  }

  .genres {
    grid-row: span 2;
    justify-content: flex-start;
    gap: 18px;
    background: linear-gradient(180deg, #1f2230, #1a1b1f);
  }

  .bars {
    display: grid;
    gap: 16px;
  }

  .bar-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 600;
  }

  .dim {
    color: var(--text-dim);
    font-weight: 500;
  }

  .bar-track {
    height: 8px;
    overflow: hidden;
    border-radius: 4px;
    background: #ffffff12;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, hsl(calc(220 + var(--i) * 28) 80% 62%), hsl(calc(250 + var(--i) * 28) 80% 70%));
    animation: grow 0.9s var(--ease) both;
    animation-delay: calc(var(--i) * 0.08s);
    transform-origin: left;
  }

  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }

  /* Cartes illustrées par la scène du titre. */
  .art {
    justify-content: flex-end;
    padding: 0;
    border: none;
  }

  .art:not(:disabled) {
    cursor: pointer;
  }

  .binge {
    grid-column: span 2;
  }

  .art-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center 25%;
    transition: transform 0.6s var(--ease);
  }

  .art:not(:disabled):hover .art-bg {
    transform: scale(1.05);
  }

  .art-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, #000000e6 0%, #00000080 45%, #00000030 100%);
  }

  .art-body {
    position: relative;
    display: grid;
    gap: 4px;
    padding: 20px 22px;
  }

  .art-title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.15;
  }

  @media (max-width: 1250px) {
    .bento {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .genres {
      grid-row: span 1;
      grid-column: span 2;
    }
  }

  @media (max-width: 1000px) {
    .kpis {
      grid-template-columns: 1fr;
    }
  }
</style>

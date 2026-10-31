<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api, errorText, formatClock, type Section, type ServerSession } from "../lib/api";
  import { toast } from "../lib/nav.svelte";
  import Icon from "./Icon.svelte";

  // Tableau de bord du serveur : lectures en cours de tous les utilisateurs et entretien des bibliothèques.
  let sessions = $state<ServerSession[] | null>(null);
  let sections = $state<Section[]>([]);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function load() {
    try {
      sessions = await api.sessions();
      error = null;
    } catch (e) {
      error = errorText(e);
    }
  }

  async function act(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast(done);
    } catch (e) {
      toast(errorText(e), true);
    }
  }

  onMount(() => {
    load();
    api.sections().then((s) => (sections = s), () => {});
    timer = setInterval(load, 10000);
  });

  onDestroy(() => clearInterval(timer));
</script>

<h3 class="sub">Lectures en cours</h3>
{#if error}
  <p class="error">{error}</p>
{:else if !sessions}
  <div class="skeleton" style:height="120px"></div>
{:else if !sessions.length}
  <p class="muted">Personne ne regarde ou n'écoute quoi que ce soit en ce moment.</p>
{:else}
  <div class="sessions">
    {#each sessions as s, i (i)}
      <div class="session">
        <div class="poster">{#if s.poster}<img src={s.poster} alt="" />{/if}</div>
        <div class="body">
          <div class="who">
            {#if s.userThumb}<img class="avatar" src={s.userThumb} alt="" />{/if}
            <span>{s.user}</span>
            <span class="state" class:paused={s.state === "paused"}>{s.state === "paused" ? "En pause" : s.state === "buffering" ? "Chargement" : "En lecture"}</span>
          </div>
          <div class="title">{s.title}</div>
          {#if s.subtitle}<div class="muted small">{s.subtitle}</div>{/if}
          <div class="bar"><div style:width="{s.durationMs ? (s.progressMs / s.durationMs) * 100 : 0}%"></div></div>
          <div class="meta">
            <span>{formatClock(s.progressMs / 1000)} / {formatClock(s.durationMs / 1000)}</span>
            <span>
              {s.player} · {s.local ? "Réseau local" : "À distance"} · {s.transcode ? "Transcodage" : "Lecture directe"}
              {#if s.bandwidthKbps}· {(s.bandwidthKbps / 1000).toFixed(1)} Mb/s{/if}
            </span>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<h3 class="sub">Bibliothèques</h3>
<div class="libs">
  {#each sections as s (s.key)}
    <div class="lib">
      <Icon name={s.kind === "movie" ? "film" : s.kind === "artist" ? "music" : "tv"} />
      <span class="lib-name">{s.title}</span>
      <button class="btn" onclick={() => act(() => api.scanSection(s.key), `Analyse de « ${s.title} » lancée`)}>
        <Icon name="search" size={16} /> Rechercher les nouveaux fichiers
      </button>
      <button class="btn" onclick={() => act(() => api.emptyTrash(s.key), `Corbeille de « ${s.title} » vidée`)} title="Retire les éléments dont le fichier a disparu">
        <Icon name="x" size={16} /> Vider la corbeille
      </button>
    </div>
  {/each}
</div>

<style>
  .sub {
    margin: 8px 0 14px;
    font-size: 17px;
  }

  .sub:not(:first-child) {
    margin-top: 32px;
  }

  .small {
    font-size: 13px;
  }

  .sessions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 14px;
  }

  .session {
    display: flex;
    gap: 16px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: #ffffff06;
  }

  .poster {
    flex: none;
    width: 64px;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    background: var(--bg-hover);
  }

  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }

  .state {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ok) 18%, transparent);
    color: var(--ok);
    font-size: 11px;
    font-weight: 700;
  }

  .state.paused {
    background: #ffffff14;
    color: var(--text-dim);
  }

  .title {
    margin-top: 4px;
    font-weight: 700;
  }

  .bar {
    height: 4px;
    margin: 10px 0 6px;
    overflow: hidden;
    border-radius: 2px;
    background: #ffffff1a;
  }

  .bar div {
    height: 100%;
    background: var(--accent);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 10px;
    color: var(--text-faint);
    font-size: 12px;
  }

  .libs {
    display: grid;
    gap: 8px;
  }

  .lib {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .lib-name {
    flex: 1;
    min-width: 140px;
    font-weight: 600;
  }

  .lib .btn {
    height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }
</style>

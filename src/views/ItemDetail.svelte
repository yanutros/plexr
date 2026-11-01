<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { api, errorText, formatDuration, isMusic, type Item, type ItemDetail } from "../lib/api";
  import MusicDetail from "./MusicDetail.svelte";
  import { go, nav, toast } from "../lib/nav.svelte";
  import { play, type PlayOptions } from "../lib/player.svelte";
  import PosterCard from "../components/PosterCard.svelte";
  import Icon from "../components/Icon.svelte";
  import { t, locale } from "../lib/i18n";

  let { ratingKey }: { ratingKey: string } = $props();

  let item = $state<ItemDetail | null>(null);
  let children = $state<Item[]>([]);
  let error = $state<string | null>(null);
  let audioStream = $state<number | null>(null);
  let subtitleStream = $state<number>(0);

  async function load() {
    try {
      const detail = await api.metadata(ratingKey);
      item = detail;
      audioStream = detail.audioTracks.find((tr) => tr.selected)?.id ?? detail.audioTracks[0]?.id ?? null;
      subtitleStream = detail.subtitleTracks.find((tr) => tr.selected)?.id ?? 0;
      children = detail.kind === "show" || detail.kind === "season" ? await api.children(ratingKey) : [];
    } catch (e) {
      error = errorText(e);
    }
  }

  function start(key: string, opts: PlayOptions = {}) {
    play(key, opts).catch((e) => toast(errorText(e), true));
  }

  function playThis(fromStart = false) {
    start(item!.ratingKey, { audioStream, subtitleStream, fromStart });
  }

  async function toggleWatched() {
    if (!item) return;
    try {
      await api.setWatched(item.ratingKey, !item.watched);
      await load();
    } catch (e) {
      toast(errorText(e), true);
    }
  }

  // Pour une saison : premier épisode non vu.
  const nextUp = $derived(item?.kind === "season" ? (children.find((c) => !c.watched) ?? children[0]) : undefined);
  const progress = $derived(
    item?.viewOffsetMs && item.durationMs ? Math.min(100, (item.viewOffsetMs / item.durationMs) * 100) : 0,
  );
  const remaining = $derived(item?.viewOffsetMs && item.durationMs ? item.durationMs - item.viewOffsetMs : null);
  const releaseDate = $derived(
    item?.releaseDate
      ? new Date(item.releaseDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : null,
  );
  const art = $derived(item?.kind === "episode" ? (item.thumb ?? item.poster) : item?.poster);

  onMount(() => {
    load();
    const unlisten = listen("player-stopped", load);
    return () => unlisten.then((f) => f());
  });
</script>

{#if error}
  <div class="page"><p class="error">{error}</p></div>
{:else if !item}
  <div class="page"><div class="skeleton" style:height="360px"></div></div>
{:else if isMusic(item.kind)}
  <MusicDetail {item} />
{:else}
  <div class="backdrop" style:background-image={item.backdrop ? `url("${item.backdrop}")` : undefined}></div>

  <div class="page detail">
    <div class="head">
      <div class="art" class:wide={item.kind === "episode"}>
        {#if art}<img src={art} alt="" />{/if}
        {#if progress > 0}<div class="progress"><div style:width="{progress}%"></div></div>{/if}
        {#if remaining}<div class="remaining">{t("item.remaining", { time: formatDuration(remaining) })}</div>{/if}
      </div>

      <div class="info">
        {#if item.showKey}
          <button class="show-link" onclick={() => go({ name: "item", ratingKey: item!.showKey! })}>
            {item.showTitle}
          </button>
        {/if}
        <h1>{item.title}</h1>
        {#if item.kind === "episode"}
          <div class="line">{t("item.seasonEpisode", { season: item.parentIndex ?? "", episode: item.index ?? "" })}</div>
        {:else if item.tagline}
          <div class="line tagline">{item.tagline}</div>
        {/if}

        <div class="meta">
          {#if item.contentRating}<span class="badge outline">{item.contentRating}</span>{/if}
          {#if releaseDate}<span>{releaseDate}</span>{:else if item.year}<span>{item.year}</span>{/if}
          {#if item.durationMs && item.kind !== "show" && item.kind !== "season"}
            <span>{formatDuration(item.durationMs)}</span>
          {/if}
          {#if item.kind === "show" || item.kind === "season"}
            <span>{t(item.kind === "show" ? "item.seasonCount" : "item.episodeCount", { count: children.length })}</span>
          {/if}
          {#if item.rating}<span class="rating"><Icon name="star" size={14} filled /> {item.rating.toFixed(1)}</span>{/if}
          {#if item.watched}<span class="badge ok">{t("item.watched")}</span>{/if}
        </div>

        <div class="actions">
          {#if item.playable}
            <button class="btn primary big" onclick={() => playThis()}>
              <Icon name="play" size={18} filled />
              {item.viewOffsetMs ? t("item.resume") : t("item.play")}
            </button>
            {#if item.viewOffsetMs}
              <button class="btn round big" onclick={() => playThis(true)} title={t("item.playFromStart")}>
                <Icon name="restart" size={18} />
              </button>
            {/if}
          {:else if nextUp}
            <button class="btn primary big" onclick={() => start(nextUp!.ratingKey)}>
              <Icon name="play" size={18} filled /> {t("item.episodeNumber", { number: nextUp.index ?? "" })}
            </button>
          {/if}
          <button
            class="btn round big"
            class:on={item.watched}
            onclick={toggleWatched}
            title={item.watched ? t("item.markUnwatched") : t("item.markWatched")}
          >
            <Icon name="checkCircle" size={20} />
          </button>
          {#if nav.admin}
            <button class="btn round big" onclick={() => (nav.editing = item)} title={t("item.editInfo")}>
              <Icon name="edit" size={18} />
            </button>
          {/if}
        </div>

        {#if item.summary}<p class="summary">{item.summary}</p>{/if}

        {#if item.genres.length}
          <div class="genres">{#each item.genres as g}<span>{g}</span>{/each}</div>
        {/if}

        <dl class="facts">
          {#if item.directors.length}<dt>{t("item.facts.director")}</dt><dd>{item.directors.join(", ")}</dd>{/if}
          {#if item.writers.length}<dt>{t("item.facts.writer")}</dt><dd>{item.writers.slice(0, 3).join(", ")}</dd>{/if}
          {#if item.studio}<dt>{t("item.facts.studio")}</dt><dd>{item.studio}</dd>{/if}
          {#if item.video}<dt>{t("item.facts.video")}</dt><dd>{item.video}</dd>{/if}
          {#if item.audioTracks.length}
            <dt>{t("item.facts.audio")}</dt>
            <dd>
              <select bind:value={audioStream}>
                {#each item.audioTracks as tr (tr.id)}<option value={tr.id}>{tr.label}</option>{/each}
              </select>
            </dd>
          {/if}
          {#if item.playable}
            <dt>{t("item.facts.subtitles")}</dt>
            <dd>
              <select bind:value={subtitleStream}>
                <option value={0}>{t("item.facts.none")}</option>
                {#each item.subtitleTracks as tr (tr.id)}<option value={tr.id}>{tr.label}</option>{/each}
              </select>
            </dd>
          {/if}
        </dl>
      </div>
    </div>

    {#if item.kind === "show" && children.length}
      <h2 class="row-title">{t("item.seasons")}</h2>
      <div class="grid">
        {#each children as season (season.ratingKey)}<PosterCard item={season} />{/each}
      </div>
    {:else if item.kind === "season"}
      <h2 class="row-title">{t("item.episodes")}</h2>
      <div class="episodes">
        {#each children as ep (ep.ratingKey)}
          <div class="episode">
            <button class="thumb" onclick={() => start(ep.ratingKey)} aria-label={t("item.playTitle", { title: ep.title })}>
              {#if ep.thumb}<img src={ep.thumb} alt="" loading="lazy" />{/if}
              <span class="play"><Icon name="play" size={20} filled /></span>
              {#if ep.viewOffsetMs && ep.durationMs}
                <div class="progress"><div style:width="{(ep.viewOffsetMs / ep.durationMs) * 100}%"></div></div>
              {/if}
            </button>
            <div class="ep-body">
              <button class="ep-title" onclick={() => go({ name: "item", ratingKey: ep.ratingKey })}>
                <span class="ep-num">{ep.index}</span>
                {ep.title}
                {#if ep.watched}<span class="badge ok">{t("item.watched")}</span>{/if}
              </button>
              <div class="ep-meta">{formatDuration(ep.durationMs)}</div>
              {#if ep.summary}<p class="ep-summary">{ep.summary}</p>{/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if item.cast.length}
      <h2 class="row-title">{t("item.cast")}</h2>
      <div class="cast">
        {#each item.cast as person (person.name + person.role)}
          <div class="person">
            <div class="avatar">
              {#if person.photo}<img src={person.photo} alt="" loading="lazy" />{:else}{person.name[0]}{/if}
            </div>
            <div class="name">{person.name}</div>
            {#if person.role}<div class="role">{person.role}</div>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0 0 0 var(--sidebar-w, 237px);
    z-index: 0;
    background-size: cover;
    background-position: center top;
    opacity: 0.35;
    mask-image: linear-gradient(#000 0%, #0008 45%, transparent 85%);
    pointer-events: none;
  }

  .detail {
    position: relative;
    z-index: 1;
    padding-top: 24px;
  }

  .head {
    display: flex;
    gap: 40px;
    align-items: flex-start;
  }

  .art {
    position: relative;
    flex: none;
    width: 260px;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    box-shadow: 0 20px 50px #000c;
  }

  .art.wide {
    width: 400px;
  }

  .art img {
    display: block;
    width: 100%;
  }

  .remaining {
    padding: 8px 12px;
    background: #000c;
    color: var(--text-dim);
    font-size: 12px;
    text-align: center;
  }

  .progress {
    height: 4px;
    background: #000a;
  }

  .art .progress {
    position: relative;
  }

  .progress div {
    height: 100%;
    background: var(--accent);
  }

  .info {
    flex: 1;
    min-width: 0;
    max-width: 820px;
  }

  .show-link {
    padding: 0;
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 16px;
    font-weight: 600;
  }

  .show-link:hover {
    color: var(--accent);
  }

  h1 {
    margin: 2px 0 4px;
    font-size: 38px;
    line-height: 1.1;
  }

  .line {
    color: var(--text-dim);
    font-size: 16px;
    font-weight: 500;
  }

  .tagline {
    font-style: italic;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
    color: var(--text-dim);
  }

  .rating {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
    font-weight: 600;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 24px 0;
  }

  .big {
    height: 46px;
  }

  .btn.primary.big {
    padding: 0 26px;
    font-size: 15px;
  }

  .btn.round.big {
    width: 46px;
  }

  .btn.on {
    color: var(--accent);
  }

  .summary {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    color: #e4e5e8;
  }

  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }

  .genres span {
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .facts {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 10px 16px;
    align-items: center;
    margin: 24px 0 0;
  }

  dt {
    color: var(--text-faint);
    font-size: 13px;
  }

  dd {
    margin: 0;
  }

  select {
    max-width: 100%;
    padding: 6px 10px;
    color: var(--accent);
    font-weight: 500;
  }

  .episodes {
    display: grid;
    gap: 6px;
  }

  .episode {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 20px;
    padding: 10px;
    border-radius: var(--radius-lg);
    transition: background 0.15s;
  }

  .episode:hover {
    background: #ffffff0a;
  }

  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--radius);
    background: var(--bg-elev);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #0007;
    color: var(--accent);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .thumb:hover .play {
    opacity: 1;
  }

  .ep-body {
    min-width: 0;
    padding-top: 4px;
  }

  .ep-title {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: none;
    background: none;
    font-size: 16px;
    font-weight: 600;
    text-align: left;
  }

  .ep-title:hover {
    color: var(--accent);
  }

  .ep-num {
    color: var(--text-faint);
  }

  .ep-meta {
    margin-top: 2px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .ep-summary {
    display: -webkit-box;
    margin: 8px 0 0;
    overflow: hidden;
    color: var(--text-dim);
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .cast {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 128px;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .person {
    text-align: center;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 112px;
    height: 112px;
    margin: 0 auto 10px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--bg-elev);
    color: var(--text-faint);
    font-size: 36px;
    font-weight: 600;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .name {
    font-weight: 600;
    font-size: 13px;
  }

  .role {
    color: var(--text-dim);
    font-size: 12px;
  }

  /* ---------- Téléphone : tout s'empile, en pleine largeur ---------- */

  :global(html.phone) .backdrop {
    inset: 0 0 auto;
    height: 60vh;
  }

  :global(html.phone) .detail {
    padding-top: 8px;
  }

  :global(html.phone) .head {
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
  }

  :global(html.phone) .art {
    align-self: center;
    width: 46%;
  }

  :global(html.phone) .art.wide {
    width: 100%;
  }

  :global(html.phone) h1 {
    font-size: 26px;
  }

  :global(html.phone) .meta {
    gap: 8px 12px;
    font-size: 13px;
  }

  :global(html.phone) .actions {
    flex-wrap: wrap;
    margin: 18px 0;
  }

  :global(html.phone) .actions .btn.primary {
    flex: 1 1 100%;
  }

  :global(html.phone) .summary {
    font-size: 14px;
  }

  :global(html.phone) .facts {
    grid-template-columns: 96px 1fr;
    font-size: 13px;
  }

  :global(html.phone) .episode {
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 0;
  }

  :global(html.phone) .ep-summary {
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font-size: 13px;
  }

  :global(html.phone) .cast {
    grid-auto-columns: 86px;
    gap: 12px;
  }

  :global(html.phone) .avatar {
    width: 76px;
    height: 76px;
    font-size: 26px;
  }
</style>

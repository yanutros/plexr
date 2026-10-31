<script lang="ts">
  import { errorText, type Item } from "../lib/api";
  import { go, nav, toast } from "../lib/nav.svelte";
  import { current, player, playMusic } from "../lib/player.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n";

  // « Titres du moment » : quatre titres par colonne, les colonnes défilent ; un clic lance la
  // sélection entière à partir du titre choisi.
  let { title, tracks }: { title: string; tracks: Item[] } = $props();

  let scroller = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(false);
  const playingKey = $derived(current()?.ratingKey);

  function update() {
    if (!scroller) return;
    atStart = scroller.scrollLeft <= 4;
    atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
  }

  function scrollBy(dir: number) {
    scroller?.scrollBy({ left: dir * scroller.clientWidth * 0.9, behavior: "smooth" });
  }

  function start(t: Item) {
    playMusic("", { keys: tracks.map((x) => x.ratingKey), start: t.ratingKey }).catch((e) => toast(errorText(e), true));
  }

  function openMenu(e: MouseEvent, t: Item) {
    e.preventDefault();
    e.stopPropagation();
    nav.menu = { item: t, x: e.clientX, y: e.clientY };
  }

  $effect(() => {
    void tracks;
    update();
  });
</script>

{#if tracks.length}
  <section>
    <div class="head">
      <h2>{title}</h2>
      <div class="arrows">
        <button class="btn round" disabled={atStart} onclick={() => scrollBy(-1)} aria-label={t("trackGrid.previous")}><Icon name="chevronLeft" size={18} /></button>
        <button class="btn round" disabled={atEnd} onclick={() => scrollBy(1)} aria-label={t("trackGrid.next")}><Icon name="chevronRight" size={18} /></button>
      </div>
    </div>
    <div class="columns" bind:this={scroller} onscroll={update}>
      {#each tracks as track (track.ratingKey)}
        <div class="track" class:playing={playingKey === track.ratingKey} oncontextmenu={(e) => openMenu(e, track)} role="group">
          <button class="cover" onclick={() => start(track)} aria-label={t("trackGrid.play", { title: track.title })}>
            {#if track.poster}<img src={track.poster} alt="" loading="lazy" />{/if}
            <span class="hover">
              {#if playingKey === track.ratingKey && !player.paused}
                <span class="eq"><i></i><i></i><i></i></span>
              {:else}
                <Icon name="play" size={16} filled />
              {/if}
            </span>
          </button>
          <button class="text" onclick={() => start(track)}>
            <span class="t">{track.title}</span>
            <span class="a">{track.subtitle ?? ""}</span>
          </button>
          <button class="dots" onclick={(e) => openMenu(e, track)} aria-label={t("trackGrid.moreActions")}><Icon name="more" size={18} /></button>
          {#if track.albumKey}
            <button class="album" onclick={() => go({ name: "item", ratingKey: track.albumKey! })} title={track.albumTitle ?? ""} aria-label={t("trackGrid.openAlbum")}>
              <Icon name="chevronRight" size={16} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  section {
    margin-top: 32px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 600;
  }

  .arrows {
    display: flex;
    gap: 6px;
  }

  .arrows .btn {
    width: 32px;
    height: 32px;
  }

  /* Quatre lignes, autant de colonnes que nécessaire ; environ trois colonnes et demie visibles. */
  .columns {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(4, auto);
    grid-auto-columns: clamp(300px, 23vw, 440px);
    column-gap: 24px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .columns::-webkit-scrollbar {
    display: none;
  }

  .track {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    scroll-snap-align: start;
  }

  .cover {
    position: relative;
    width: 48px;
    height: 48px;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 6px;
    background: var(--bg-elev);
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hover {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #0009;
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .track:hover .hover,
  .track.playing .hover {
    opacity: 1;
  }

  .text {
    display: grid;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
  }

  .t,
  .a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .t {
    font-weight: 500;
  }

  .track.playing .t {
    color: var(--accent);
  }

  .a {
    color: var(--text-dim);
    font-size: 13px;
  }

  .dots,
  .album {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-dim);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .track:hover .dots,
  .track:hover .album,
  .dots:focus-visible {
    opacity: 1;
  }

  .dots:hover,
  .album:hover {
    background: #ffffff14;
    color: var(--text);
  }

  .eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }

  .eq i {
    width: 3px;
    background: var(--accent);
    animation: eq 0.9s ease-in-out infinite;
  }

  .eq i:nth-child(2) {
    animation-delay: -0.3s;
  }

  .eq i:nth-child(3) {
    animation-delay: -0.6s;
  }

  @keyframes eq {
    0%,
    100% {
      height: 30%;
    }
    50% {
      height: 100%;
    }
  }
</style>

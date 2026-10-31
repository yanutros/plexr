<script lang="ts">
  import { moveFocus } from "../lib/spatial";
  import type { TvCard } from "../lib/tvcards";

  /**
   * Grille des téléviseurs (toute une bibliothèque, ses catégories…) : nombre de colonnes fixe,
   * flèches gérées ici sans calcul de position, et seules les lignes à l'écran sont dessinées
   * (`content-visibility`), pour garder peu de mémoire même avec des milliers de titres.
   * `onEnd` est appelé quand la sélection approche de la fin, pour charger la suite.
   */
  let { cards, onEnd }: { cards: TvCard[]; onEnd?: () => void } = $props();

  const shape = $derived(cards[0]?.shape ?? "poster");
  const columns = $derived(shape === "wide" ? 4 : shape === "poster" ? 6 : 5);

  let index = $state(0);
  let root = $state<HTMLElement>();

  function focusAt(i: number) {
    const el = root?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function onFocusIn(e: FocusEvent) {
    const i = (e.target as HTMLElement).dataset.index;
    if (i === undefined) return;
    index = Number(i);
    if (index >= cards.length - columns * 3) onEnd?.();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).dataset.index === undefined) return;
    const c = index % columns;
    let next = index;
    if (e.key === "ArrowRight") next = Math.min(index + 1, cards.length - 1);
    else if (e.key === "ArrowLeft") {
      if (c === 0) {
        e.preventDefault();
        moveFocus("ArrowLeft");
        return;
      }
      next = index - 1;
    } else if (e.key === "ArrowDown") next = Math.min(index + columns, cards.length - 1);
    else if (e.key === "ArrowUp") {
      if (index < columns) {
        e.preventDefault();
        moveFocus("ArrowUp");
        return;
      }
      next = index - columns;
    } else return;
    e.preventDefault();
    focusAt(next);
  }
</script>

<div
  class="tv-grid {shape}"
  style:--columns={columns}
  bind:this={root}
  data-nav-grid
  role="presentation"
  onfocusin={onFocusIn}
  onkeydown={onKey}
>
  {#each cards as card, i (card.key)}
    <button
      class="cell"
      data-index={i}
      data-nav-default={i === index ? "" : undefined}
      onclick={card.open}
      aria-label={card.title}
    >
      <span class="img">
        {#if card.image}<img src={card.image} alt="" loading="lazy" decoding="async" />{/if}
        {#if shape === "wide"}<span class="overlay">{card.label}</span>{/if}
        {#if card.progress > 0}<span class="progress"><span style:width="{card.progress}%"></span></span>{/if}
      </span>
      {#if shape !== "wide"}<span class="label">{card.label}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tv-grid {
    --ratio: 2 / 3;
    display: grid;
    grid-template-columns: repeat(var(--columns), 1fr);
    gap: 28px 20px;
    padding: 6px 4px 48px;
  }

  .tv-grid.square,
  .tv-grid.round {
    --ratio: 1;
  }

  .tv-grid.wide {
    --ratio: 16 / 9;
  }

  /* Hors de l'écran, une case n'est ni mise en page ni dessinée. */
  .cell {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    content-visibility: auto;
    contain-intrinsic-size: auto 300px;
  }

  .img {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: var(--ratio);
    overflow: hidden;
    border-radius: 10px;
    background: var(--bg-elev);
    transition: transform 0.15s;
  }

  .round .img {
    border-radius: 50%;
  }

  .img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cell:focus {
    outline: none;
  }

  .cell:focus .img {
    outline: 3px solid #fff;
    outline-offset: 3px;
    transform: scale(1.05);
  }

  .label {
    overflow: hidden;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell:focus .label {
    color: var(--text);
  }

  .round .label {
    text-align: center;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    padding: 14px;
    background: linear-gradient(0deg, #000000c0, transparent 60%);
    font-size: 18px;
    font-weight: 800;
  }

  .progress {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    height: 4px;
    border-radius: 2px;
    background: #ffffff40;
  }

  .progress span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }
</style>

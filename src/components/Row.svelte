<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  // `large` : grandes jaquettes qui grandissent avec la fenêtre (rangées de musique).
  let {
    title,
    wide = false,
    large = false,
    children,
  }: { title: string; wide?: boolean; large?: boolean; children: Snippet } = $props();

  let scroller = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(false);

  function update() {
    if (!scroller) return;
    atStart = scroller.scrollLeft <= 4;
    atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
  }

  function scrollBy(dir: number) {
    scroller?.scrollBy({ left: dir * scroller.clientWidth * 0.85, behavior: "smooth" });
  }

  $effect(() => {
    update();
  });
</script>

<section>
  <div class="head">
    <h2>{title}</h2>
    <div class="arrows">
      <button class="btn round" disabled={atStart} onclick={() => scrollBy(-1)} aria-label="Précédent">
        <Icon name="chevronLeft" size={18} />
      </button>
      <button class="btn round" disabled={atEnd} onclick={() => scrollBy(1)} aria-label="Suivant">
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  </div>
  <div class="scroller" class:wide class:large bind:this={scroller} onscroll={update}>
    {@render children()}
  </div>
</section>

<style>
  section {
    margin-top: 28px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
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

  .scroller {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 160px;
    gap: 18px;
    overflow-x: auto;
    /* Marge pour la carte soulevée au survol (4 px) et son liseré (2 px), sinon rognés par le défilement. */
    padding: 12px 8px 16px;
    margin: -12px -8px -10px;
    scrollbar-width: none;
  }

  .scroller::-webkit-scrollbar {
    display: none;
  }

  .scroller.wide {
    grid-auto-columns: 300px;
  }

  .scroller.large {
    grid-auto-columns: clamp(180px, 15vw, 300px);
    gap: 22px;
  }
</style>

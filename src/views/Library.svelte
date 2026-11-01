<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type Genre, type Hub, type Item } from "../lib/api";
  import { genreLabel } from "../lib/genres";
  import PosterCard from "../components/PosterCard.svelte";
  import Row from "../components/Row.svelte";
  import HeroCarousel from "../components/HeroCarousel.svelte";
  import GenreTile from "../components/GenreTile.svelte";
  import ContinueRow from "../components/ContinueRow.svelte";
  import FeaturePanels, { type Panel } from "../components/FeaturePanels.svelte";
  import { go, toast } from "../lib/nav.svelte";
  import { play } from "../lib/player.svelte";
  import Icon from "../components/Icon.svelte";
  import TvRows from "../components/TvRows.svelte";
  import TvGrid from "../components/TvGrid.svelte";
  import { device } from "../lib/device";
  import { fromItem, type TvCard } from "../lib/tvcards";
  import { t } from "../lib/i18n";

  let {
    sectionKey,
    title,
    initialTab = "recommended",
  }: { sectionKey: string; title: string; initialTab?: "recommended" | "library" | "categories" } = $props();

  type Tab = "recommended" | "library" | "categories";
  const TABS: { id: Tab; label: string }[] = [
    { id: "recommended", label: t("library.tabs.recommended") },
    { id: "library", label: t("library.tabs.library") },
    { id: "categories", label: t("library.tabs.categories") },
  ];
  const PAGE_SIZE = 120;

  let tab = $state<Tab>("recommended");
  let error = $state<string | null>(null);

  // --- Recommandé ---
  let hubs = $state<Hub[] | null>(null);
  // Bandeau : ce qu'on est en train de regarder d'abord, puis le reste des rangées, avec une image de fond.
  const slides = $derived.by(() => {
    const all = (hubs ?? []).flatMap((h) => h.items).filter((i) => i.backdrop);
    const seen = new Set<string>();
    const unique = [...all.filter((i) => i.viewOffsetMs), ...all].filter((i) => {
      const key = i.showKey ?? i.ratingKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.slice(0, 5);
  });

  // « Continuer à regarder » en grand, puis des panneaux « À la une » tirés des autres rangées.
  const isContinue = (h: Hub) => /\.inprogress/.test(h.identifier) && h.items.every((it) => it.playable);
  const continueHubs = $derived(hubs?.filter(isContinue) ?? []);
  const restHubs = $derived(hubs?.filter((h) => !isContinue(h)) ?? []);
  const panels = $derived.by<Panel[]>(() => {
    const taken = new Set(slides.map((s) => s.showKey ?? s.ratingKey));
    const out: Panel[] = [];
    // Un titre par rangée, pour varier, puis on complète avec les suivants.
    for (let round = 0; round < 3 && out.length < 6; round++) {
      for (const hub of restHubs) {
        const it = hub.items.filter((i) => i.backdrop && !taken.has(i.showKey ?? i.ratingKey))[0];
        if (!it || out.length >= 6) continue;
        taken.add(it.showKey ?? it.ratingKey);
        out.push({
          key: it.ratingKey,
          eyebrow: hub.title,
          title: it.showTitle ?? it.title,
          subtitle: [it.year, it.genres.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || null,
          image: it.backdrop,
          cover: it.poster,
          caption: it.summary,
          onclick: () => go({ name: "item", ratingKey: it.ratingKey }),
          onplay: it.playable ? () => play(it.ratingKey).catch((e) => toast(errorText(e), true)) : undefined,
        });
      }
    }
    return out;
  });

  // --- Bibliothèque ---
  let items = $state<Item[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let genre = $state<Genre | null>(null);
  let sentinel = $state<HTMLElement>();

  // --- Catégories ---
  let genres = $state<Genre[] | null>(null);

  // --- Téléviseur : mêmes données, en rangées et grilles TV ---
  const tvRows = $derived([
    ...continueHubs.map((h) => ({ title: h.title, cards: h.items.map((i) => fromItem(i, t("library.resume"), true)) })),
    ...restHubs.map((h) => ({ title: h.title, cards: h.items.map((i) => fromItem(i, h.title)) })),
  ].filter((r) => r.cards.length));
  const tvItems = $derived(items.map((i) => fromItem(i, title)));
  const tvGenres = $derived<TvCard[]>(
    (genres ?? []).map((g) => ({
      key: g.id,
      image: g.backdrop ?? g.posters[0] ?? null,
      shape: "wide",
      label: genreLabel(g.title),
      progress: 0,
      eyebrow: t("library.category"),
      title: genreLabel(g.title),
      logo: null,
      logoGuid: null,
      genres: [],
      line: t("library.titleCount", { count: g.count }),
      summary: null,
      backdrop: g.backdrop,
      open: () => openGenre(g),
    })),
  );

  async function loadMore() {
    if (tab !== "library" || loading || (total && items.length >= total)) return;
    loading = true;
    const forGenre = genre?.id ?? null;
    try {
      const page = await api.sectionItems(sectionKey, items.length, PAGE_SIZE, null, forGenre);
      if ((genre?.id ?? null) !== forGenre) return;
      items.push(...page.items);
      total = page.total;
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }

  function resetLibrary() {
    items = [];
    total = 0;
    loading = false;
  }

  function select(next: Tab) {
    tab = next;
    error = null;
    if (next === "library" && !items.length) loadMore();
    if (next === "categories" && !genres) {
      api.genres(sectionKey).then(
        (g) => (genres = g),
        (e) => (error = errorText(e)),
      );
    }
  }

  // Une catégorie ouvre la bibliothèque filtrée sur ce genre.
  function openGenre(g: Genre | null) {
    genre = g;
    resetLibrary();
    select("library");
    loadMore();
  }

  onMount(() => {
    if (initialTab !== "recommended") select(initialTab);
    api.sectionHubs(sectionKey).then(
      (h) => (hubs = h),
      (e) => (error = errorText(e)),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "600px" },
    );
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

{#snippet tvHead()}
  <div class="tv-head">
    <h1>{title}</h1>
    <div class="tabs" role="tablist" data-nav-low>
      {#each TABS as tb (tb.id)}
        <button role="tab" aria-selected={tab === tb.id} class:active={tab === tb.id} onclick={() => select(tb.id)}>{tb.label}</button>
      {/each}
    </div>
    {#if tab === "library" && genre}
      <button class="filter tv-filter" onclick={() => openGenre(null)} data-nav-low>
        {genreLabel(genre.title)} <Icon name="x" size={14} />
      </button>
    {/if}
    {#if tab === "library" && total}<span class="muted">{t("library.titleCount", { count: total })}</span>{/if}
  </div>
{/snippet}

{#if device.tv}
  {#if tab === "recommended"}
    {#if hubs}
      <TvRows rows={tvRows} header={tvHead} />
    {:else}
      <div class="page">{@render tvHead()}</div>
    {/if}
  {:else}
    <div class="page">
      {@render tvHead()}
      {#if error}<p class="error">{error}</p>{/if}
      {#if tab === "library"}
        <TvGrid cards={tvItems} onEnd={loadMore} />
      {:else}
        <TvGrid cards={tvGenres} />
      {/if}
    </div>
  {/if}
{:else}
<div class="page">
  <div class="head">
    <h1 class="row-title page-title">
      {title}
      {#if tab === "library" && total}<span class="muted">{total}</span>{/if}
    </h1>
    <div class="tabs" role="tablist" data-nav-low>
      {#each TABS as tb (tb.id)}
        <button role="tab" aria-selected={tab === tb.id} class:active={tab === tb.id} onclick={() => select(tb.id)}>
          {tb.label}
        </button>
      {/each}
    </div>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if tab === "recommended"}
    {#if !hubs}
      <div class="skeleton" style:height="420px"></div>
    {:else}
      <HeroCarousel items={slides} eyebrow={(i) => (i.viewOffsetMs ? t("library.upNext") : t("library.discover"))} />
      {#each continueHubs as hub, i (i)}
        <ContinueRow title={hub.title} items={hub.items} />
      {/each}
      <!-- Téléphone : pas de panneaux « À la une », trop grands pour l'écran. -->
      {#if panels.length && !device.phone}
        <h2 class="feature-title">{t("library.featured")}</h2>
        <FeaturePanels {panels} />
      {/if}
      {#each restHubs as hub, i (i)}
        <!-- Vignettes larges seulement pour une rangée d'épisodes ; une rangée mêlant saisons et épisodes reste en affiches. -->
        {@const wide = hub.items.every((it) => it.kind === "episode")}
        <Row title={hub.title} {wide}>
          {#each hub.items as item (item.ratingKey)}<PosterCard {item} {wide} />{/each}
        </Row>
      {/each}
    {/if}
  {:else if tab === "library"}
    {#if genre}
      <div class="filter">
        <span>{t("library.genreFilter")} <strong>{genreLabel(genre.title)}</strong></span>
        <button class="chip-x" onclick={() => openGenre(null)} aria-label={t("library.removeFilter")}><Icon name="x" size={14} /></button>
      </div>
    {/if}
    <div class="grid">
      {#each items as item (item.ratingKey)}<PosterCard {item} />{/each}
    </div>
  {:else if !genres}
    <div class="categories">
      {#each Array(6) as _, i (i)}<div class="skeleton tile-skeleton"></div>{/each}
    </div>
  {:else}
    <div class="categories">
      {#each genres as g (g.id)}<GenreTile genre={g} onclick={() => openGenre(g)} />{/each}
    </div>
  {/if}

  <div bind:this={sentinel} class="sentinel">{#if loading}<span class="muted">{t("library.loading")}</span>{/if}</div>
</div>
{/if}

<style>
  .tv-head {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-bottom: 20px;
  }

  .tv-head h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
  }

  .tv-filter {
    margin: 0;
    color: var(--text);
    font: inherit;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 20px;
  }

  .head .page-title {
    margin-bottom: 0;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 22px;
    background: #ffffff0d;
  }

  .tabs button {
    padding: 7px 16px;
    border: none;
    border-radius: 18px;
    background: none;
    color: var(--text-dim);
    font-weight: 600;
    transition: background 0.15s, color 0.15s;
  }

  .tabs button:hover {
    color: var(--text);
  }

  .tabs button.active {
    background: var(--accent);
    color: var(--accent-text);
  }

  .feature-title {
    margin: 32px 0 14px;
    font-size: 22px;
    font-weight: 700;
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    padding: 6px 8px 6px 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--bg-elev);
  }

  .chip-x {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: #ffffff14;
  }

  .chip-x:hover {
    background: var(--accent);
    color: var(--accent-text);
  }

  .categories {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
  }

  .tile-skeleton {
    aspect-ratio: 16 / 9;
    border-radius: 18px;
  }

  .sentinel {
    height: 40px;
    margin-top: 16px;
  }
</style>

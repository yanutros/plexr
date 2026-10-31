<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type Hub, type Item } from "../lib/api";
  import PosterCard from "../components/PosterCard.svelte";
  import Row from "../components/Row.svelte";
  import FeaturePanels, { type Panel } from "../components/FeaturePanels.svelte";
  import TrackGrid from "../components/TrackGrid.svelte";
  import { go, toast } from "../lib/nav.svelte";
  import { playMusic } from "../lib/player.svelte";
  import TvRows from "../components/TvRows.svelte";
  import TvGrid from "../components/TvGrid.svelte";
  import { device } from "../lib/device";
  import { fromItem } from "../lib/tvcards";

  let { sectionKey, title }: { sectionKey: string; title: string } = $props();

  type Tab = "recommended" | "artists" | "albums" | "playlists";
  const TABS: { id: Tab; label: string }[] = [
    { id: "recommended", label: "Recommandé" },
    { id: "artists", label: "Artistes" },
    { id: "albums", label: "Albums" },
    { id: "playlists", label: "Listes de lecture" },
  ];
  // Types Plex : 8 = artiste, 9 = album.
  const KIND: Record<"artists" | "albums", number> = { artists: 8, albums: 9 };
  const PAGE_SIZE = 120;

  let tab = $state<Tab>("recommended");
  let hubs = $state<Hub[] | null>(null);
  let items = $state<Item[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sentinel = $state<HTMLElement>();

  // Onglet Recommandé, façon Apple Music : grands panneaux des derniers albums, listes de lecture
  // tout de suite après, « Titres du moment », nouveautés en grandes pochettes, puis les rangées Plex.
  let newAlbums = $state<Item[]>([]);
  let hotTracks = $state<Item[]>([]);
  const isPlaylistHub = (h: Hub) => h.items.every((i) => i.kind === "playlist");
  const playlistHub = $derived(hubs?.find(isPlaylistHub) ?? null);
  // « Récemment ajouté » ferait doublon avec les nouveautés.
  const otherHubs = $derived(
    hubs?.filter((h) => !isPlaylistHub(h) && !(newAlbums.length && /ajout/i.test(h.title))) ?? [],
  );
  const panels = $derived<Panel[]>(
    newAlbums.slice(0, 6).map((a, i) => ({
      key: a.ratingKey,
      eyebrow: i === 0 ? "Dernier ajout" : "Nouvel album",
      title: a.title,
      subtitle: a.subtitle,
      image: a.backdrop,
      cover: a.poster,
      square: true,
      caption: [a.year, a.genres.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || null,
      onclick: () => go({ name: "item", ratingKey: a.ratingKey }),
      onplay: () => playMusic(a.ratingKey).catch((e) => toast(errorText(e), true)),
    })),
  );

  // Téléviseur : mêmes données, en rangées et grilles TV.
  const tvRows = $derived(
    [
      ...(playlistHub ? [{ title: playlistHub.title, cards: playlistHub.items.map((i) => fromItem(i, "Liste de lecture")) }] : []),
      { title: "Titres du moment", cards: hotTracks.map((i) => fromItem(i, "Titre du moment")) },
      { title: "Nouveautés", cards: newAlbums.map((i) => fromItem(i, "Nouvel album")) },
      ...otherHubs.map((h) => ({ title: h.title, cards: h.items.map((i) => fromItem(i, h.title)) })),
    ].filter((r) => r.cards.length),
  );
  const tvItems = $derived(items.map((i) => fromItem(i, title)));

  async function loadMore() {
    if (tab === "recommended" || loading || (total && items.length >= total)) return;
    loading = true;
    const forTab = tab;
    try {
      // Les playlists arrivent d'un bloc ; artistes et albums page par page.
      const page =
        forTab === "playlists"
          ? await api.playlists(sectionKey).then((list) => ({ items: list, total: list.length }))
          : await api.sectionItems(sectionKey, items.length, PAGE_SIZE, KIND[forTab]);
      if (tab !== forTab) return;
      items.push(...page.items);
      total = page.total;
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }

  function select(next: Tab) {
    if (next === tab) return;
    tab = next;
    items = [];
    total = 0;
    error = null;
    loading = false;
    loadMore();
  }

  onMount(() => {
    api.sectionHubs(sectionKey).then(
      (h) => (hubs = h),
      (e) => (error = errorText(e)),
    );
    // Types Plex : 9 = album, 10 = titre.
    api.sectionItems(sectionKey, 0, 24, 9, null, "addedAt:desc").then((p) => (newAlbums = p.items), () => {});
    api.sectionItems(sectionKey, 0, 24, 10, null, "lastViewedAt:desc").then(
      async (p) => {
        // Rien d'écouté récemment : les titres les plus écoutés prennent le relais.
        hotTracks = p.items.length ? p.items : (await api.sectionItems(sectionKey, 0, 24, 10, null, "viewCount:desc")).items;
      },
      () => {},
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
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => select(t.id)}>{t.label}</button>
      {/each}
    </div>
    {#if tab !== "recommended" && total}<span class="muted">{total}</span>{/if}
  </div>
{/snippet}

{#if device.tv}
  {#if tab === "recommended" && hubs && tvRows.length}
    <TvRows rows={tvRows} header={tvHead} />
  {:else}
    <div class="page">
      {@render tvHead()}
      {#if error}<p class="error">{error}</p>{/if}
      {#if tab !== "recommended"}<TvGrid cards={tvItems} onEnd={loadMore} />{/if}
    </div>
  {/if}
{:else}
<div class="page">
  <div class="head">
    <h1 class="row-title page-title">
      {title}
      {#if tab !== "recommended" && total}<span class="muted">{total}</span>{/if}
    </h1>
    <div class="tabs" role="tablist">
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => select(t.id)}>
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#if tab === "recommended"}
    {#if !hubs}
      <div class="skeleton" style:height="260px"></div>
    {:else if !hubs.length}
      <p class="muted">Rien à recommander pour l'instant : parcours les artistes ou les albums.</p>
    {:else}
      <FeaturePanels {panels} />
      {#if playlistHub}
        <Row title={playlistHub.title} large>
          {#each playlistHub.items as item (item.ratingKey)}<PosterCard {item} />{/each}
        </Row>
      {/if}
      <TrackGrid title="Titres du moment" tracks={hotTracks} />
      {#if newAlbums.length}
        <Row title="Nouveautés" large>
          {#each newAlbums as item (item.ratingKey)}<PosterCard {item} />{/each}
        </Row>
      {/if}
      {#each otherHubs as hub, i (i)}
        <Row title={hub.title} large>
          {#each hub.items as item (item.ratingKey)}<PosterCard {item} />{/each}
        </Row>
      {/each}
    {/if}
  {:else}
    <div class="grid">
      {#each items as item (item.ratingKey)}<PosterCard {item} />{/each}
    </div>
  {/if}
  <div bind:this={sentinel} class="sentinel">{#if loading}<span class="muted">Chargement…</span>{/if}</div>
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

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
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

  .sentinel {
    height: 40px;
    margin-top: 16px;
  }
</style>

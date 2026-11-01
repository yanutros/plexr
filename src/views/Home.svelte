<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { api, errorText, type Home, type SeerrMedia } from "../lib/api";
  import PosterCard from "../components/PosterCard.svelte";
  import SeerrCard from "../components/SeerrCard.svelte";
  import Row from "../components/Row.svelte";
  import HeroCarousel from "../components/HeroCarousel.svelte";
  import ContinueRow from "../components/ContinueRow.svelte";
  import TvHome from "../components/TvHome.svelte";
  import { device } from "../lib/device";
  import { t } from "../lib/i18n";

  let home = $state<Home | null>(null);
  let trending = $state<SeerrMedia[]>([]);
  let error = $state<string | null>(null);

  // Bannière : jusqu'à 5 éléments « À suivre », sinon les derniers ajouts.
  const slides = $derived(
    home ? (home.onDeck.length ? home.onDeck : home.recentlyAdded.filter((i) => i.backdrop)) : [],
  );

  async function load() {
    try {
      home = await api.home();
    } catch (e) {
      error = errorText(e);
    }
  }

  onMount(() => {
    load();
    // Seerr est facultatif : la rangée n'apparaît que s'il répond.
    api.seerrTrending().then((r) => (trending = r.filter((m) => m.status !== 5)), () => {});
    const unlisten = listen("player-stopped", load);
    return () => unlisten.then((f) => f());
  });
</script>

{#if error}
  <div class="page"><p class="error">{error}</p></div>
{:else if !home}
  <div class="hero-skeleton skeleton"></div>
{:else if device.tv}
  <TvHome onDeck={home.onDeck} recent={home.recentlyAdded} {trending} />
{:else}
  <HeroCarousel items={slides} bleed eyebrow={() => (home?.onDeck.length ? t("home.upNext") : t("home.new"))} />

  <div class="page rows">
    {#if home.onDeck.length}
      <ContinueRow title={t("home.continueWatching")} items={home.onDeck} />
    {/if}
    <Row title={t("home.recentlyAdded")}>
      {#each home.recentlyAdded as item (item.ratingKey)}<PosterCard {item} />{/each}
    </Row>
    {#if trending.length}
      <Row title={t("home.trendingToRequest")}>
        {#each trending as media (media.mediaType + media.tmdbId)}<SeerrCard {media} />{/each}
      </Row>
    {/if}
  </div>
{/if}

<style>
  .hero-skeleton {
    height: min(62vh, 560px);
    margin-top: -68px;
    border-radius: 0;
  }

  .rows {
    padding-top: 0;
  }

  :global(html.phone) .hero-skeleton {
    height: 40vh;
    margin-top: 0;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type SeerrMedia, type SeerrSlider } from "../lib/api";
  import { go } from "../lib/nav.svelte";
  import SeerrCard from "../components/SeerrCard.svelte";
  import Row from "../components/Row.svelte";

  // Rangées de l'accueil de Seerr, dans le même ordre.
  type Source = { id: string; title: string; load: () => Promise<SeerrMedia[]> };
  const slider = (s: SeerrSlider) => () => api.seerrSlider(s);
  const SOURCES: Source[] = [
    { id: "requests", title: "Demandes récentes", load: api.seerrRecentRequests },
    { id: "watchlist", title: "Ta liste de suivi", load: api.seerrWatchlist },
    { id: "trending", title: "Tendances", load: slider("trending") },
    { id: "popularMovies", title: "Films populaires", load: slider("popularMovies") },
    { id: "upcomingMovies", title: "Films à venir", load: slider("upcomingMovies") },
    { id: "popularTv", title: "Séries populaires", load: slider("popularTv") },
    { id: "upcomingTv", title: "Séries à venir", load: slider("upcomingTv") },
  ];

  let rows = $state<Record<string, SeerrMedia[] | null>>({});
  let error = $state<string | null>(null);

  onMount(() => {
    for (const s of SOURCES) {
      rows[s.id] = null;
      s.load().then(
        (list) => (rows[s.id] = list),
        (e) => {
          rows[s.id] = [];
          // Seerr injoignable ou non configuré : un seul message suffit.
          if (s.id === "trending") error = errorText(e);
        },
      );
    }
  });
</script>

<div class="page">
  <h1 class="row-title page-title">Découvrir</h1>
  {#if error}
    <p class="error">{error}</p>
    <button class="btn" onclick={() => go({ name: "settings" })}>Configurer Seerr</button>
  {:else}
    {#each SOURCES as s (s.id)}
      {#if rows[s.id] === null}
        <div class="loading">
          <div class="row-title">{s.title}</div>
          <div class="skeleton" style:height="240px"></div>
        </div>
      {:else if rows[s.id]?.length}
        <Row title={s.title}>
          {#each rows[s.id]! as media (media.mediaType + media.tmdbId)}<SeerrCard {media} />{/each}
        </Row>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .loading .row-title {
    margin: 28px 0 12px;
  }
</style>

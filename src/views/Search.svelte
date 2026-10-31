<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type Item, type SeerrMedia } from "../lib/api";
  import { go } from "../lib/nav.svelte";
  import PosterCard from "../components/PosterCard.svelte";
  import SeerrCard from "../components/SeerrCard.svelte";

  let { query }: { query: string } = $props();

  let plex = $state<Item[] | null>(null);
  let seerr = $state<SeerrMedia[] | null>(null);
  let plexError = $state<string | null>(null);
  let seerrError = $state<string | null>(null);

  onMount(() => {
    // Page ouverte depuis le menu (téléviseur) : rien à chercher tant qu'aucun titre n'est saisi.
    if (!query) return;
    api.search(query).then((r) => (plex = r), (e) => (plexError = errorText(e)));
    api.seerrSearch(query).then((r) => (seerr = r), (e) => (seerrError = errorText(e)));
  });

  // Les titres déjà disponibles apparaissent dans la bibliothèque : on ne garde que le reste.
  const requestable = $derived(seerr?.filter((m) => m.status !== 5) ?? null);
</script>

<div class="page">
  {#if !query}
    <p class="muted hint">Saisis le titre d'un film, d'une série ou un artiste.</p>
  {:else}
  <div class="row-title">Dans ta bibliothèque</div>
  {#if plexError}
    <p class="error">{plexError}</p>
  {:else if !plex}
    <p class="muted">Recherche…</p>
  {:else if !plex.length}
    <p class="muted">Aucun résultat pour « {query} ».</p>
  {:else}
    <div class="grid">
      {#each plex as item (item.ratingKey)}<PosterCard {item} />{/each}
    </div>
  {/if}
  
  <div class="row-title">Pas dans la bibliothèque ? Demande-le</div>
  {#if seerrError}
    <p class="muted">
      Seerr indisponible : {seerrError}
      <button class="btn" onclick={() => go({ name: "settings" })}>Réglages</button>
    </p>
  {:else if !requestable}
    <p class="muted">Recherche sur Seerr…</p>
  {:else if !requestable.length}
    <p class="muted">Rien d'autre à demander.</p>
  {:else}
    <div class="grid">
      {#each requestable as media (media.mediaType + media.tmdbId)}<SeerrCard {media} />{/each}
    </div>
  {/if}
  {/if}
</div>

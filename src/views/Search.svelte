<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type Item, type SeerrMedia } from "../lib/api";
  import { go } from "../lib/nav.svelte";
  import PosterCard from "../components/PosterCard.svelte";
  import SeerrCard from "../components/SeerrCard.svelte";
  import { t } from "../lib/i18n";

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
    <p class="muted hint">{t("search.hint")}</p>
  {:else}
  <div class="row-title">{t("search.inLibrary")}</div>
  {#if plexError}
    <p class="error">{plexError}</p>
  {:else if !plex}
    <p class="muted">{t("search.searching")}</p>
  {:else if !plex.length}
    <p class="muted">{t("search.noResults", { query })}</p>
  {:else}
    <div class="grid">
      {#each plex as item (item.ratingKey)}<PosterCard {item} />{/each}
    </div>
  {/if}
  
  <div class="row-title">{t("search.notInLibrary")}</div>
  {#if seerrError}
    <p class="muted">
      {t("search.seerrUnavailable", { error: seerrError })}
      <button class="btn" onclick={() => go({ name: "settings" })}>{t("search.settings")}</button>
    </p>
  {:else if !requestable}
    <p class="muted">{t("search.searchingSeerr")}</p>
  {:else if !requestable.length}
    <p class="muted">{t("search.nothingElse")}</p>
  {:else}
    <div class="grid">
      {#each requestable as media (media.mediaType + media.tmdbId)}<SeerrCard {media} />{/each}
    </div>
  {/if}
  {/if}
</div>

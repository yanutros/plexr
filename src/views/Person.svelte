<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type Item } from "../lib/api";
  import { device } from "../lib/device";
  import { t } from "../lib/i18n";
  import { fromItem } from "../lib/tvcards";
  import PosterCard from "../components/PosterCard.svelte";
  import TvGrid from "../components/TvGrid.svelte";

  /** Une personne (acteur) : ses films et séries dans les bibliothèques du serveur, comme dans Plex. */
  let { id, name, photo }: { id: number; name: string; photo: string | null } = $props();

  let items = $state<Item[] | null>(null);
  let error = $state<string | null>(null);

  onMount(() => {
    api.personItems(id).then(
      (list) => (items = list),
      (e) => (error = errorText(e)),
    );
  });
</script>

<div class="page">
  <header class="person-head">
    <div class="avatar">{#if photo}<img src={photo} alt="" />{:else}{name.charAt(0)}{/if}</div>
    <div>
      <h1>{name}</h1>
      {#if items}
        <p class="muted">{items.length ? t("person.titles", { count: items.length }) : t("person.none")}</p>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if !items}
    <p class="muted">{t("common.c1.loading")}</p>
  {:else if device.tv}
    <TvGrid cards={items.map((i) => fromItem(i, name))} />
  {:else}
    <div class="grid">
      {#each items as item (item.ratingKey)}<PosterCard {item} />{/each}
    </div>
  {/if}
</div>

<style>
  .person-head {
    display: flex;
    align-items: center;
    gap: 24px;
    margin: 8px 0 32px;
  }

  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 132px;
    height: 132px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--bg-elev);
    color: var(--text-faint);
    font-size: 48px;
    font-weight: 700;
    box-shadow: 0 16px 40px #000a;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 34px;
  }

  :global(html.phone) .person-head {
    gap: 16px;
    margin-bottom: 20px;
  }

  :global(html.phone) .avatar {
    width: 88px;
    height: 88px;
    font-size: 32px;
  }

  :global(html.phone) h1 {
    font-size: 24px;
  }
</style>

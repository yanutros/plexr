<script lang="ts">
  import type { Item, SeerrMedia } from "../lib/api";
  import { fromItem, fromSeerr } from "../lib/tvcards";
  import TvRows from "./TvRows.svelte";
  import { t } from "../lib/i18n";

  /** Accueil des téléviseurs : reprise, derniers ajouts et tendances Seerr en rangées TV. */
  let { onDeck, recent, trending }: { onDeck: Item[]; recent: Item[]; trending: SeerrMedia[] } = $props();

  const rows = $derived(
    [
      { title: t("tv.continueWatching"), cards: onDeck.map((i) => fromItem(i, t("tv.resume"), true)) },
      { title: t("tv.recentlyAdded"), cards: recent.map((i) => fromItem(i, t("tv.recentlyAddedOne"))) },
      { title: t("tv.trendingToRequest"), cards: trending.map(fromSeerr) },
    ].filter((r) => r.cards.length),
  );
</script>

<TvRows {rows} />

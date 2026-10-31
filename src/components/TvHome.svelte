<script lang="ts">
  import type { Item, SeerrMedia } from "../lib/api";
  import { fromItem, fromSeerr } from "../lib/tvcards";
  import TvRows from "./TvRows.svelte";

  /** Accueil des téléviseurs : reprise, derniers ajouts et tendances Seerr en rangées TV. */
  let { onDeck, recent, trending }: { onDeck: Item[]; recent: Item[]; trending: SeerrMedia[] } = $props();

  const rows = $derived(
    [
      { title: "Continuer à regarder", cards: onDeck.map((i) => fromItem(i, "Reprendre", true)) },
      { title: "Ajouts récents", cards: recent.map((i) => fromItem(i, "Ajout récent")) },
      { title: "Tendances à demander", cards: trending.map(fromSeerr) },
    ].filter((r) => r.cards.length),
  );
</script>

<TvRows {rows} />

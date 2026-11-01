<script lang="ts">
  /**
   * Titre d'un film ou d'une série : son logo officiel (« clear logo », comme Jellyfin) quand Plex
   * en a un, sinon le texte. `--logo-h` et `--logo-w` règlent la taille maximale du logo.
   */
  let { logo, title }: { logo: string | null; title: string } = $props();

  let failed = $state(false);
</script>

{#if logo && !failed}
  <img class="title-logo" src={logo} alt={title} title={title} onerror={() => (failed = true)} />
{:else}
  {title}
{/if}

<style>
  .title-logo {
    display: block;
    max-width: var(--logo-w, min(440px, 80%));
    max-height: var(--logo-h, 120px);
    object-fit: contain;
    object-position: left bottom;
    filter: drop-shadow(0 2px 14px #000b);
  }
</style>

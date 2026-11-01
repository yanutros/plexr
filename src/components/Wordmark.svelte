<script lang="ts">
  // Le nom de Maku en logotype : majuscules condensées dans la couleur du thème, comme une affiche de cinéma.
  import "@fontsource/bebas-neue/400.css";

  let { size = 30 }: { size?: number } = $props();
</script>

<span class="wordmark" style:font-size="{size}px">MAKU</span>

<style>
  .wordmark {
    display: inline-block;
    color: var(--accent);
    font-family: "Bebas Neue", "Impact", sans-serif;
    font-weight: 400;
    line-height: 0.9;
    letter-spacing: 0.04em;
    /* La police est haute et étroite : un léger relief la détache du fond. */
    text-shadow: 0 2px 12px color-mix(in srgb, var(--accent) 30%, transparent);
    transform: translateY(0.06em);
  }
</style>

<script lang="ts">
  // Logo de Maku : le soleil rayé, dans la couleur du thème, sur fond nuit (docs/logo.html) ; `bare` :
  // le soleil seul, sans le fond (à côté du nom, où le carré noir se perdrait sur le fond sombre).
  let { size = 28, glow = false, bare = false }: { size?: number; glow?: boolean; bare?: boolean } = $props();
</script>

<svg class="logo" class:glow viewBox={bare ? "4.2 4.2 15.6 15.6" : "0 0 24 24"} width={size} height={size} aria-hidden="true">
  {#if !bare}<rect width="24" height="24" rx="6" fill="#0c0c0c" />{/if}
  <path
    fill="var(--accent)"
    d="M12,4.31A7.69,7.69 0,0 1,19.59,13.22L4.41,13.22A7.69,7.69 0,0 1,12,4.31ZM4.52,13.78L19.48,13.78A7.69,7.69 0,0 1,19.12,14.91L4.88,14.91A7.69,7.69 0,0 1,4.52,13.78ZM5.29,15.75L18.71,15.75A7.69,7.69 0,0 1,17.94,16.88L6.06,16.88A7.69,7.69 0,0 1,5.29,15.75ZM7.19,18L16.81,18A7.69,7.69 0,0 1,12,19.69A7.69,7.69 0,0 1,7.19,18Z"
  />
</svg>

<style>
  .logo {
    flex: none;
  }

  .glow {
    filter: drop-shadow(0 0 22px color-mix(in srgb, var(--accent) 35%, transparent));
  }
</style>

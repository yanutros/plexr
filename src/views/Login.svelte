<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api, errorText, type LoginPin } from "../lib/api";
  import { device } from "../lib/device";

  let { onDone }: { onDone: () => void } = $props();

  let pin = $state<LoginPin | null>(null);
  let mode = $state<"browser" | "link">("browser");
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  // Deux façons de se connecter : valider dans le navigateur de l'appareil, ou saisir un code
  // sur plex.tv/link depuis un téléphone (indispensable sur téléviseur).
  async function login(next: "browser" | "link") {
    mode = next;
    error = null;
    clearInterval(timer);
    try {
      const p = await api.startLogin(next === "link");
      pin = p;
      timer = setInterval(async () => {
        try {
          if (await api.pollLogin(p.pinId)) {
            clearInterval(timer);
            onDone();
          }
        } catch (e) {
          clearInterval(timer);
          error = errorText(e);
        }
      }, 2000);
    } catch (e) {
      error = errorText(e);
    }
  }

  onMount(() => {
    // Sur téléviseur, pas de navigateur : le code s'affiche tout de suite.
    if (device.tv) login("link");
  });

  onDestroy(() => clearInterval(timer));
</script>

<div class="center">
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a.5.5 0 0 0 .8.4l11.5-7.5a.5.5 0 0 0 0-.8L7.8 4.1a.5.5 0 0 0-.8.4z" /></svg>
    </div>
    <h1>Plexr</h1>
    <p class="muted">Ton client Plex, avec les demandes Seerr intégrées.</p>

    {#if pin && mode === "link"}
      <p>Sur ton téléphone ou ton ordinateur, va sur</p>
      <p class="site">plex.tv/link</p>
      <p>et saisis ce code :</p>
      <div class="code">{#each pin.code.split("") as c, i (i)}<span>{c}</span>{/each}</div>
      <p class="muted small">La connexion se fera toute seule dès que le code sera validé.</p>
      <div class="row">
        <button class="btn" onclick={() => login("link")}>Nouveau code</button>
        {#if !device.tv}<button class="btn" onclick={() => login("browser")}>Utiliser le navigateur</button>{/if}
      </div>
    {:else if pin}
      <p>Valide la connexion dans le navigateur qui vient de s'ouvrir…</p>
      <div class="row">
        <button class="btn" onclick={() => login("browser")}>Recommencer</button>
        <button class="btn" onclick={() => login("link")}>Utiliser un code</button>
      </div>
    {:else}
      <div class="row">
        <button class="btn primary" onclick={() => login("browser")}>Se connecter avec Plex</button>
        <button class="btn" onclick={() => login("link")}>Avec un code (plex.tv/link)</button>
      </div>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
  </div>
</div>

<style>
  .card {
    display: grid;
    justify-items: center;
    gap: 6px;
    width: min(560px, 92vw);
    text-align: center;
  }

  .card p {
    margin: 4px 0;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    margin-bottom: 8px;
    padding-left: 6px;
    border-radius: 20px;
    background: linear-gradient(145deg, #f7bd3a, #e5a00d 55%, #c98400);
    color: #1a1300;
    box-shadow: 0 0 40px #e5a00d55;
  }

  .logo svg {
    width: 34px;
    height: 34px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 40px;
  }

  .site {
    color: var(--accent);
    font-size: 26px;
    font-weight: 800;
  }

  .code {
    display: flex;
    gap: 10px;
    margin: 10px 0;
  }

  .code span {
    display: grid;
    place-items: center;
    width: 64px;
    height: 78px;
    border: 1px solid #ffffff26;
    border-radius: 14px;
    background: var(--bg-elev);
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-size: 40px;
    font-weight: 800;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 12px;
  }

  .small {
    font-size: 13px;
  }
</style>

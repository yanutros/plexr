<script lang="ts">
  import { onDestroy } from "svelte";
  import { api, errorText, type LoginPin } from "../lib/api";
  import { device } from "../lib/device";
  import { t } from "../lib/i18n";

  let { onDone }: { onDone: () => void } = $props();

  // D'abord le choix du serveur : Plex ou Jellyfin.
  let server = $state<"plex" | "jellyfin" | null>(null);
  let pin = $state<LoginPin | null>(null);
  let mode = $state<"browser" | "link">("browser");
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  // Deux façons de se connecter : valider dans le navigateur de l'appareil, ou saisir un code
  // sur plex.tv/link depuis un téléphone (indispensable sur téléviseur).
  async function login(next: "browser" | "link") {
    server = "plex";
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

  // Plex : sur téléviseur, pas de navigateur, le code s'affiche tout de suite.
  function choosePlex() {
    if (device.tv) login("link");
    else server = "plex";
  }

  // --- Jellyfin : adresse du serveur, identifiant, mot de passe ---
  let jfUrl = $state("");
  let jfUser = $state("");
  let jfPassword = $state("");
  let jfBusy = $state(false);

  async function loginJellyfin(e: SubmitEvent) {
    e.preventDefault();
    jfBusy = true;
    error = null;
    try {
      await api.jellyfinLogin(jfUrl, jfUser, jfPassword);
      onDone();
    } catch (err) {
      error = errorText(err);
    } finally {
      jfBusy = false;
    }
  }

  function back() {
    clearInterval(timer);
    server = null;
    pin = null;
    error = null;
  }


  onDestroy(() => clearInterval(timer));
</script>

<div class="center">
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a.5.5 0 0 0 .8.4l11.5-7.5a.5.5 0 0 0 0-.8L7.8 4.1a.5.5 0 0 0-.8.4z" /></svg>
    </div>
    <h1>Plexr</h1>
    <p class="muted">{t("login.tagline")}</p>

    {#if server === null}
      <!-- Le serveur de médias : Plex ou Jellyfin. -->
      <p>{t("login.chooseServer")}</p>
      <div class="servers">
        <button class="server-btn" onclick={choosePlex}>
          <span class="server-name">Plex</span>
          <span class="muted small">{t("login.plexHint")}</span>
        </button>
        <button class="server-btn" onclick={() => (server = "jellyfin")}>
          <span class="server-name">Jellyfin</span>
          <span class="muted small">{t("login.jellyfinHint")}</span>
        </button>
      </div>
    {:else if server === "jellyfin"}
      <form class="jf" onsubmit={loginJellyfin}>
        <label>{t("login.jellyfinUrl")} <input bind:value={jfUrl} placeholder="http://192.168.1.10:8096" autocomplete="url" spellcheck="false" required /></label>
        <label>{t("login.username")} <input bind:value={jfUser} autocomplete="username" spellcheck="false" required /></label>
        <label>{t("login.password")} <input type="password" bind:value={jfPassword} autocomplete="current-password" /></label>
        <div class="row">
          <button type="button" class="btn" onclick={back}>{t("login.back")}</button>
          <button type="submit" class="btn primary" disabled={jfBusy}>{jfBusy ? t("login.connecting") : t("login.connect")}</button>
        </div>
      </form>
    {:else if pin && mode === "link"}
      <p>{t("login.goTo")}</p>
      <p class="site">plex.tv/link</p>
      <p>{t("login.enterCode")}</p>
      <div class="code">{#each pin.code.split("") as c, i (i)}<span>{c}</span>{/each}</div>
      <p class="muted small">{t("login.autoConnect")}</p>
      <div class="row">
        <button class="btn" onclick={() => login("link")}>{t("login.newCode")}</button>
        {#if !device.tv}<button class="btn" onclick={() => login("browser")}>{t("login.useBrowser")}</button>{/if}
      </div>
    {:else if pin}
      <p>{t("login.validateInBrowser")}</p>
      <div class="row">
        <button class="btn" onclick={() => login("browser")}>{t("login.restart")}</button>
        <button class="btn" onclick={() => login("link")}>{t("login.useCode")}</button>
      </div>
    {:else}
      <div class="row">
        <button class="btn primary" onclick={() => login("browser")}>{t("login.signIn")}</button>
        <button class="btn" onclick={() => login("link")}>{t("login.withCode", { site: "plex.tv/link" })}</button>
        <button class="btn" onclick={back}>{t("login.back")}</button>
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
    background: linear-gradient(145deg, var(--accent-light), var(--accent) 55%, var(--accent-dark));
    color: var(--accent-text);
    box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 33%, transparent);
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

  .servers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    width: 100%;
    margin-top: 14px;
  }

  .server-btn {
    display: grid;
    gap: 6px;
    padding: 22px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--bg-elev);
    text-align: center;
    transition: border-color 0.15s, transform 0.15s;
  }

  .server-btn:hover,
  .server-btn:focus-visible {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .server-name {
    font-size: 22px;
    font-weight: 800;
  }

  .jf {
    display: grid;
    gap: 12px;
    width: 100%;
    margin-top: 14px;
    text-align: left;
  }

  .jf label {
    display: grid;
    gap: 6px;
    color: var(--text-dim);
    font-size: 13px;
  }
</style>

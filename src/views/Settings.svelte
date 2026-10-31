<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import QrCode from "../components/QrCode.svelte";
  import { applyInvite, decodeInvite, encodeInvite, readQrImage, type InviteStatus } from "../lib/invite";
  import { api, errorText, tracearrLogin, type Account, type Pref, type Section, type Session } from "../lib/api";
  import { go, nav, toast } from "../lib/nav.svelte";
  import { ordered, saveSidebar, sidebar } from "../lib/sidebar.svelte";
  import { device } from "../lib/device";
  import Icon, { type IconName } from "../components/Icon.svelte";
  import ServerPrefs from "../components/ServerPrefs.svelte";
  import ServerDashboard from "../components/ServerDashboard.svelte";

  let { session, onChange }: { session: Session; onChange: () => void } = $props();

  // Rubriques de Plexr, puis celles du serveur Plex (administrateur seulement), comme dans Plex Web.
  const GROUPS: Record<string, { label: string; icon: IconName }> = {
    general: { label: "Général", icon: "sliders" },
    library: { label: "Bibliothèque", icon: "film" },
    network: { label: "Réseau", icon: "compass" },
    transcoder: { label: "Transcodeur", icon: "play" },
    dlna: { label: "DLNA", icon: "tv" },
    extras: { label: "Bonus", icon: "star" },
    butler: { label: "Tâches planifiées", icon: "clock" },
  };

  let page = $state("account");
  let account = $state<Account | null>(null);
  let prefs = $state<Pref[] | null>(null);
  let prefsError = $state<string | null>(null);
  let advanced = $state(false);

  const groups = $derived(
    Object.keys(GROUPS).filter((g) => prefs?.some((p) => p.group === g)),
  );

  // Champs éditables, initialisés une fois depuis la session.
  let seerrUrl = $state("");
  let tracearrUrl = $state("");
  let mpvPath = $state("");
  $effect.pre(() => {
    seerrUrl = session.seerrUrl ?? "";
    tracearrUrl = session.tracearrUrl ?? "";
    mpvPath = session.mpvPath ?? "";
  });

  let seerrBusy = $state(false);
  let seerrError = $state<string | null>(null);
  let tracearrBusy = $state(false);
  let tracearrError = $state<string | null>(null);

  async function loadPrefs() {
    try {
      prefs = await api.prefs();
      prefsError = null;
    } catch (e) {
      prefsError = errorText(e);
    }
  }

  async function saveSeerr() {
    seerrBusy = true;
    seerrError = null;
    try {
      await api.seerrConfigure(seerrUrl);
      toast(seerrUrl ? "Connecté à Seerr avec ton compte Plex" : "Seerr désactivé");
      onChange();
    } catch (e) {
      seerrError = errorText(e);
    } finally {
      seerrBusy = false;
    }
  }

  async function connectTracearr() {
    tracearrBusy = true;
    tracearrError = null;
    try {
      if (tracearrUrl.trim() !== (session.tracearrUrl ?? "")) await api.tracearrConfigure(tracearrUrl);
      if (!tracearrUrl.trim()) {
        toast("Tracearr désactivé");
      } else {
        await tracearrLogin();
        toast("Connecté à Tracearr");
        go({ name: "stats" });
      }
      onChange();
    } catch (e) {
      tracearrError = errorText(e);
    } finally {
      tracearrBusy = false;
    }
  }

  // --- Invitations ---
  // L'administrateur partage ses adresses Seerr et Tracearr ; les autres les appliquent en un geste.
  // Adresses à partager : celles de l'administrateur par défaut, modifiables (il n'a pas besoin
  // de s'être connecté lui-même pour inviter).
  let inviteSeerr = $state("");
  let inviteTracearr = $state("");
  $effect.pre(() => {
    inviteSeerr = session.seerrUrl ?? "";
    inviteTracearr = session.tracearrUrl ?? "";
  });
  const isUrl = (v: string) => /^https?:\/\/[^\s]+$/.test(v.trim());
  const inviteCode = $derived(
    isUrl(inviteSeerr) || isUrl(inviteTracearr)
      ? encodeInvite({
          seerr: isUrl(inviteSeerr) ? inviteSeerr.trim().replace(/\/+$/, "") : undefined,
          tracearr: isUrl(inviteTracearr) ? inviteTracearr.trim().replace(/\/+$/, "") : undefined,
        })
      : "",
  );
  let inviteQr = $state<HTMLElement>();
  let relayUrl = $state<string | null>(null);
  let relayError = $state<string | null>(null);
  let applying = $state<InviteStatus | null>(null);
  let pasted = $state("");
  let inviteError = $state<string | null>(null);

  async function runInvite(text: string, phone: boolean) {
    const invite = decodeInvite(text);
    if (!invite) {
      inviteError = "Ce code d'invitation n'est pas valide.";
      if (phone) api.relayStatus({ step: "error", error: inviteError }).catch(() => {});
      return;
    }
    inviteError = null;
    const result = await applyInvite(
      invite,
      (status) => {
        applying = status;
        if (phone) api.relayStatus(status).catch(() => {});
      },
      phone,
    );
    onChange();
    if (result.step === "done") toast("Seerr et Tracearr sont configurés");
  }

  async function onInviteImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const text = await readQrImage(file).catch(() => null);
    if (text) runInvite(text, false);
    else inviteError = "Aucun QR code trouvé dans cette image.";
  }

  async function copyInviteCode() {
    await navigator.clipboard.writeText(inviteCode);
    toast("Code d'invitation copié");
  }

  // Le QR code en image PNG, à coller dans un message.
  async function copyInviteImage() {
    const svg = inviteQr?.querySelector("svg");
    if (!svg) return;
    try {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 600;
      canvas.getContext("2d")!.drawImage(img, 0, 0, 600, 600);
      const blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("image"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Image du QR code copiée");
    } catch (e) {
      toast(errorText(e), true);
    }
  }

  // Tablette et téléviseur : le téléphone envoie le code par le relais, tant que la page est ouverte.
  $effect(() => {
    if (page !== "services" || !device.mobile) return;
    let closed = false;
    let unlisten: (() => void) | undefined;
    api.relayStart().then(
      (url) => {
        if (!closed) relayUrl = url;
      },
      (e) => (relayError = errorText(e)),
    );
    listen<string>("relay-code", (e) => runInvite(e.payload, true)).then((f) => (closed ? f() : (unlisten = f)));
    return () => {
      closed = true;
      unlisten?.();
      api.relayStop().catch(() => {});
      relayUrl = null;
    };
  });

  const STEP: Record<string, string> = { run: "Connexion…", ok: "Connecté", err: "Échec" };

  async function disconnectTracearr() {
    await api.tracearrLogout();
    toast("Déconnecté de Tracearr");
    onChange();
  }

  async function saveMpv() {
    try {
      await api.setMpvPath(mpvPath || null);
      toast("Chemin de mpv enregistré");
      onChange();
    } catch (e) {
      toast(errorText(e), true);
    }
  }

  function resetSidebar() {
    sidebar.order = [];
    sidebar.hidden = [];
    // Sur téléviseur, le menu reste replié hors sélection.
    sidebar.collapsed = device.tv;
    saveSidebar();
    toast("Menu réinitialisé");
  }

  async function changeServer() {
    // Oublier le serveur ramène à l'écran de choix.
    await api.forgetServer();
    onChange();
  }

  // Téléviseur : ordre et visibilité des bibliothèques du menu, aux flèches de la télécommande.
  let sections = $state<Section[]>([]);
  const libraries = $derived(ordered(sections));

  async function moveLibrary(key: string, delta: number) {
    const keys = libraries.map((s) => s.key);
    const i = keys.indexOf(key);
    keys.splice(i, 1);
    keys.splice(i + delta, 0, key);
    sidebar.order = keys;
    saveSidebar();
    // La ligne a bougé : la sélection la suit (ou passe à l'autre flèche en bout de liste).
    await tick();
    const own = document.querySelector<HTMLButtonElement>(`[data-lib="${key}"][data-dir="${delta}"]`);
    const other = document.querySelector<HTMLButtonElement>(`[data-lib="${key}"][data-dir="${-delta}"]`);
    (own && !own.disabled ? own : other)?.focus();
  }

  function toggleLibrary(key: string) {
    sidebar.hidden = sidebar.hidden.includes(key) ? sidebar.hidden.filter((k) => k !== key) : [...sidebar.hidden, key];
    saveSidebar();
  }

  async function logout() {
    await api.logout();
    onChange();
  }

  onMount(() => {
    api.account().then((a) => (account = a), () => {});
    if (device.tv) api.sections().then((s) => (sections = s), () => {});
    if (nav.admin) loadPrefs();
  });
</script>

{#snippet link(id: string, label: string, icon: IconName)}
  <button class:active={page === id} onclick={() => (page = id)}><Icon name={icon} size={17} /> {label}</button>
{/snippet}

<div class="page settings">
  <nav class="menu">
    <div class="menu-group">Plexr</div>
    {@render link("account", "Compte", "user")}
    {@render link("services", "Seerr et Tracearr", "compass")}
    {#if !device.tv}{@render link("player", "Lecteur", "play")}{/if}
    {@render link("interface", "Interface", "menu")}

    <div class="menu-group">Serveur {session.serverName}</div>
    {#if nav.admin}
      {@render link("dashboard", "Tableau de bord", "server")}
      {#each groups as g (g)}{@render link(g, GROUPS[g].label, GROUPS[g].icon)}{/each}
      <label class="adv-toggle">
        <input type="checkbox" bind:checked={advanced} />
        Afficher les réglages avancés
      </label>
    {:else}
      <p class="locked"><Icon name="lock" size={14} /> Les réglages du serveur sont réservés à son administrateur.</p>
    {/if}
  </nav>

  <div class="panel">
    {#if page === "account"}
      <h1 class="title">Compte</h1>
      <section class="card account">
        {#if account?.thumb}<img class="avatar" src={account.thumb} alt="" />{:else}<span class="avatar ph"><Icon name="user" size={30} /></span>{/if}
        <div>
          <div class="big">{account?.username ?? "…"}</div>
          {#if account?.email}<div class="muted">{account.email}</div>{/if}
          <div class="badges">
            {#if account?.plexPass}<span class="badge pass">Plex Pass</span>{/if}
            <span class="badge outline">{nav.admin ? "Administrateur du serveur" : "Accès partagé"}</span>
          </div>
        </div>
      </section>
      <section class="card">
        <p>Serveur : <strong>{session.serverName}</strong></p>
        <div class="row">
          <button class="btn" onclick={changeServer}>Changer de serveur</button>
          <button class="btn" onclick={logout}><Icon name="logout" size={16} /> Se déconnecter</button>
        </div>
      </section>
    {:else if page === "services"}
      <h1 class="title">Seerr et Tracearr</h1>
      <section class="card">
        <h2>Configuration rapide</h2>
        {#if device.mobile}
          <div class="phone-setup">
            {#if relayUrl}<QrCode text={relayUrl} size={190} />{:else}<div class="qr-wait skeleton"></div>{/if}
            <p class="muted">
              Scanne ce code avec ton téléphone, connecté au même Wi-Fi, puis montre-lui l'invitation de
              l'administrateur du serveur.
            </p>
          </div>
          {#if relayError}<p class="error">{relayError}</p>{/if}
        {:else}
          <p class="muted">Colle le code d'invitation de l'administrateur du serveur, ou importe l'image de son QR code.</p>
          <div class="row">
            <input class="grow" bind:value={pasted} placeholder="PLEXR-INVITE:…" spellcheck="false" />
            <button class="btn primary" disabled={!pasted.trim() || applying?.step === "running"} onclick={() => runInvite(pasted, false)}>
              Appliquer
            </button>
            <label class="btn">
              <Icon name="image" size={16} /> Importer l'image
              <input type="file" accept="image/*" hidden onchange={onInviteImage} />
            </label>
          </div>
        {/if}
        {#if applying}
          <ul class="steps">
            {#if applying.seerr}<li class={applying.seerr}>Demandes (Seerr) : {applying.seerrError ?? STEP[applying.seerr]}</li>{/if}
            {#if applying.tracearr}
              <li class={applying.tracearr}>
                Statistiques (Tracearr) : {applying.tracearrError ??
                  (applying.authUrl ? "à autoriser sur le téléphone" : STEP[applying.tracearr])}
              </li>
            {/if}
          </ul>
        {/if}
        {#if inviteError}<p class="error">{inviteError}</p>{/if}
      </section>
      {#if nav.admin}
        <section class="card">
          <h2>Inviter des utilisateurs</h2>
          <p class="muted">
            Partage ce QR code ou ce code : Plexr y trouvera ces adresses et s'y connectera avec le compte Plex de chacun.
          </p>
          <div class="invite-fields">
            <label>Adresse de Seerr <input bind:value={inviteSeerr} placeholder="https://seerr.mondomaine.fr" /></label>
            <label>Adresse de Tracearr <input bind:value={inviteTracearr} placeholder="https://tracearr.mondomaine.fr" /></label>
          </div>
          {#if inviteCode}
          <div class="invite">
            <div bind:this={inviteQr}><QrCode text={inviteCode} size={170} /></div>
            <div class="invite-side">
              <code class="invite-code">{inviteCode}</code>
              {#if !device.tv}
                <div class="row">
                  <button class="btn" onclick={copyInviteCode}><Icon name="copy" size={16} /> Copier le code</button>
                  <button class="btn" onclick={copyInviteImage}><Icon name="image" size={16} /> Copier l'image</button>
                </div>
              {/if}
            </div>
          </div>
          {/if}
        </section>
      {/if}
      <section class="card">
        <h2>Seerr</h2>
        <p class="muted">
          Les demandes se font avec ton compte Plex, à ton nom : rien d'autre à saisir. Ton compte doit simplement
          avoir été importé dans Seerr par l'administrateur.
        </p>
        <label>Adresse de Seerr <input bind:value={seerrUrl} placeholder="https://seerr.mondomaine.fr" /></label>
        <div>
          <button class="btn primary" disabled={seerrBusy} onclick={saveSeerr}>
            {seerrBusy ? "Connexion…" : "Se connecter avec Plex"}
          </button>
        </div>
        {#if seerrError}<p class="error">{seerrError}</p>{/if}
      </section>
      <section class="card">
        <h2>Tracearr</h2>
        <p class="muted">
          Tes statistiques de visionnage personnelles. La connexion passe par ton compte Plex : ton navigateur s'ouvre une
          fois pour autoriser Tracearr, puis la session dure 30 jours.
        </p>
        <label>Adresse de Tracearr <input bind:value={tracearrUrl} placeholder="https://tracearr.mondomaine.fr" /></label>
        <div class="row">
          <button class="btn primary" disabled={tracearrBusy} onclick={connectTracearr}>
            {tracearrBusy ? "En attente de validation dans le navigateur…" : "Se connecter avec Plex"}
          </button>
          {#if session.tracearrConnected}
            <button class="btn" onclick={disconnectTracearr}>Se déconnecter</button>
            <span class="ok">● Connecté</span>
          {/if}
        </div>
        {#if tracearrError}<p class="error">{tracearrError}</p>{/if}
      </section>
    {:else if page === "player"}
      <h1 class="title">Lecteur</h1>
      <section class="card">
        <p class="muted">La lecture se fait avec mpv. Laisse vide pour le chercher automatiquement.</p>
        <label>Chemin de mpv <input bind:value={mpvPath} placeholder="C:\Program Files\mpv\mpv.exe" /></label>
        <div><button class="btn" onclick={saveMpv}>Enregistrer</button></div>
      </section>
    {:else if page === "interface"}
      <h1 class="title">Interface</h1>
      {#if device.tv}
      <section class="card">
        <h2>Bibliothèques du menu</h2>
        <div class="libs">
          {#each libraries as s, i (s.key)}
            {@const off = sidebar.hidden.includes(s.key)}
            <div class="lib" class:off>
              <Icon name={s.kind === "movie" ? "film" : s.kind === "artist" ? "music" : "tv"} />
              <span class="lib-name">{s.title}</span>
              <button class="btn round" data-lib={s.key} data-dir="-1" disabled={i === 0} onclick={() => moveLibrary(s.key, -1)} aria-label="Monter {s.title}">
                <Icon name="chevronUp" size={18} />
              </button>
              <button class="btn round" data-lib={s.key} data-dir="1" disabled={i === libraries.length - 1} onclick={() => moveLibrary(s.key, 1)} aria-label="Descendre {s.title}">
                <Icon name="chevronDown" size={18} />
              </button>
              <button class="btn round" onclick={() => toggleLibrary(s.key)} aria-label={off ? `Afficher ${s.title}` : `Masquer ${s.title}`}>
                <Icon name={off ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          {/each}
        </div>
        <div><button class="btn" onclick={resetSidebar}>Réinitialiser le menu</button></div>
      </section>
      {:else}
      <section class="card">
        <label class="switch-line">
          <span>
            <strong>Menu replié</strong>
            <span class="muted">N'affiche que les icônes, pour laisser toute la place au contenu.</span>
          </span>
          <input type="checkbox" bind:checked={sidebar.collapsed} onchange={saveSidebar} />
        </label>
        <p class="muted">
          Pour réordonner ou masquer des bibliothèques, clique sur le crayon à côté de « Bibliothèques » dans le menu.
        </p>
        <div><button class="btn" onclick={resetSidebar}>Réinitialiser le menu</button></div>
      </section>
      {/if}
    {:else if page === "dashboard"}
      <h1 class="title">Tableau de bord</h1>
      <ServerDashboard />
    {:else if GROUPS[page]}
      <h1 class="title">{GROUPS[page].label}</h1>
      {#if prefsError}
        <p class="error">{prefsError}</p>
      {:else if !prefs}
        <div class="skeleton" style:height="300px"></div>
      {:else}
        <ServerPrefs prefs={prefs.filter((p) => p.group === page)} {advanced} onSaved={loadPrefs} />
      {/if}
    {/if}
  </div>
</div>

<style>
  .phone-setup {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .phone-setup p {
    max-width: 320px;
    margin: 0;
  }

  .qr-wait {
    flex: none;
    width: 190px;
    height: 190px;
  }

  .grow {
    flex: 1;
    min-width: 220px;
  }

  .steps {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .steps li {
    position: relative;
    padding: 3px 0 3px 18px;
  }

  .steps li::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    width: 9px;
    height: 9px;
    margin-top: -4px;
    border-radius: 50%;
    background: var(--accent);
  }

  .steps li.ok::before {
    background: var(--ok);
  }

  .steps li.err::before {
    background: var(--danger);
  }

  .invite-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .invite {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .invite-side {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .invite-code {
    display: block;
    padding: 10px 12px;
    overflow: hidden;
    border-radius: var(--radius);
    background: #00000040;
    color: var(--text-dim);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .libs {
    display: grid;
    gap: 6px;
  }

  .lib {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 6px 14px;
    border-radius: var(--radius);
    background: #ffffff08;
  }

  .lib-name {
    flex: 1;
    font-weight: 600;
  }

  .lib.off .lib-name,
  .lib.off > :global(svg) {
    opacity: 0.4;
  }

  .settings {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }

  .menu {
    position: sticky;
    top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu-group {
    padding: 18px 12px 6px;
    overflow: hidden;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-group:first-child {
    padding-top: 4px;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--text-dim);
    font-weight: 500;
    text-align: left;
  }

  .menu button:hover {
    background: #ffffff0d;
    color: var(--text);
  }

  .menu button.active {
    background: #ffffff14;
    color: var(--text);
  }

  .menu button.active :global(svg) {
    color: var(--accent);
  }

  .adv-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 12px 0;
    color: var(--text-dim);
    font-size: 13px;
    cursor: pointer;
  }

  .adv-toggle input {
    accent-color: var(--accent);
  }

  .locked {
    display: flex;
    gap: 8px;
    margin: 4px 12px;
    color: var(--text-faint);
    font-size: 13px;
  }

  .title {
    margin: 4px 0 18px;
    font-size: 30px;
  }

  .card {
    display: grid;
    gap: 12px;
    max-width: 720px;
    margin-bottom: 16px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: #ffffff05;
  }

  .card h2 {
    margin: 0;
    font-size: 18px;
  }

  .card p {
    margin: 0;
  }

  label {
    display: grid;
    gap: 4px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .ok {
    margin-left: 4px;
    color: var(--ok);
    font-size: 13px;
    font-weight: 600;
  }

  .account {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 18px;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar.ph {
    display: grid;
    place-items: center;
    background: var(--bg-hover);
    color: var(--text-faint);
  }

  .big {
    font-size: 22px;
    font-weight: 700;
  }

  .badges {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }

  .badge.pass {
    background: var(--accent);
    color: var(--accent-text);
  }

  .switch-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }

  .switch-line span {
    display: grid;
    gap: 2px;
  }

  .switch-line input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
</style>

<script lang="ts">
  import type { Section } from "../lib/api";
  import { go, nav, type View } from "../lib/nav.svelte";
  import { ordered, saveSidebar, sidebar } from "../lib/sidebar.svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import { device } from "../lib/device";

  let { sections, serverName }: { sections: Section[]; serverName: string | null } = $props();

  const list = $derived(ordered(sections));
  const shown = $derived(list.filter((s) => !sidebar.hidden.includes(s.key)));
  const hidden = $derived(list.filter((s) => sidebar.hidden.includes(s.key)));

  let dragged = $state<string | null>(null);

  function icon(kind: string): IconName {
    return kind === "movie" ? "film" : kind === "artist" ? "music" : "tv";
  }

  function isActive(name: string, key?: string) {
    const v = nav.view;
    return v.name === name && (key === undefined || (v.name === "section" && v.key === key));
  }

  function open(view: View) {
    go(view);
  }

  function toggleCollapsed() {
    sidebar.collapsed = !sidebar.collapsed;
    if (sidebar.collapsed) sidebar.editing = false;
    saveSidebar();
  }

  function toggleHidden(key: string) {
    sidebar.hidden = sidebar.hidden.includes(key) ? sidebar.hidden.filter((k) => k !== key) : [...sidebar.hidden, key];
    saveSidebar();
  }

  // Glisser-déposer : la bibliothèque déplacée prend la place de celle survolée.
  function onDragOver(e: DragEvent, target: string) {
    e.preventDefault();
    if (!dragged || dragged === target) return;
    const keys = list.map((s) => s.key);
    const to = keys.indexOf(target);
    keys.splice(keys.indexOf(dragged), 1);
    keys.splice(to, 0, dragged);
    sidebar.order = keys;
  }

  function onDragEnd() {
    dragged = null;
    saveSidebar();
  }

  function move(key: string, delta: number) {
    const keys = list.map((s) => s.key);
    const i = keys.indexOf(key);
    const j = Math.max(0, Math.min(keys.length - 1, i + delta));
    keys.splice(i, 1);
    keys.splice(j, 0, key);
    sidebar.order = keys;
    saveSidebar();
  }
</script>

<!-- Sur téléviseur, le menu reste replié et ne se déplie que lorsqu'on y entre. -->
<aside
  class:collapsed={sidebar.collapsed}
  data-nav-zone
  onfocusin={() => device.tv && (sidebar.collapsed = false)}
  onfocusout={(e) => device.tv && !e.currentTarget.contains(e.relatedTarget as Node) && (sidebar.collapsed = true)}
>
  <div class="brand">
    <button class="toggle" onclick={toggleCollapsed} aria-label={sidebar.collapsed ? "Déplier le menu" : "Replier le menu"} title={sidebar.collapsed ? "Déplier le menu" : "Replier le menu"}>
      <Icon name="menu" />
    </button>
    {#if !sidebar.collapsed}
      <span class="logo"><Icon name="play" size={14} filled /></span>
      <span class="name">Plexr</span>
    {/if}
  </div>

  <nav>
    {#if device.tv}
      <button class="item" class:active={isActive("search")}
            aria-current={isActive("search") ? "page" : undefined} onclick={() => open({ name: "search", query: "" })} title="Rechercher">
        <Icon name="search" /> <span class="label">Rechercher</span>
      </button>
    {/if}
    <button class="item" class:active={isActive("home")}
            aria-current={isActive("home") ? "page" : undefined} onclick={() => open({ name: "home" })} title="Accueil">
      <Icon name="home" /> <span class="label">Accueil</span>
    </button>

    {#if sections.length}
      <div class="group">
        <span>Bibliothèques</span>
        {#if !sidebar.collapsed && !device.tv}
          <button
            class="customize"
            class:on={sidebar.editing}
            onclick={() => (sidebar.editing = !sidebar.editing)}
            title={sidebar.editing ? "Terminer" : "Réorganiser les bibliothèques"}
            aria-label="Réorganiser les bibliothèques"
          >
            <Icon name={sidebar.editing ? "check" : "edit"} size={13} />
          </button>
        {/if}
      </div>

      {#if sidebar.editing}
        <p class="hint">Glisse pour réordonner, l'œil masque une bibliothèque.</p>
        {#each list as s (s.key)}
          <div
            class="item edit"
            class:dragging={dragged === s.key}
            class:off={sidebar.hidden.includes(s.key)}
            draggable="true"
            ondragstart={(e) => {
              dragged = s.key;
              e.dataTransfer?.setData("text/plain", s.key);
            }}
            ondragover={(e) => onDragOver(e, s.key)}
            ondragend={onDragEnd}
            role="listitem"
          >
            <span class="grip"><Icon name="grip" size={16} /></span>
            <Icon name={icon(s.kind)} />
            <span class="label">{s.title}</span>
            <button class="mini" onclick={() => move(s.key, -1)} aria-label="Monter {s.title}"><Icon name="chevronDown" size={14} /></button>
            <button class="mini" onclick={() => toggleHidden(s.key)} aria-label="Afficher ou masquer {s.title}">
              <Icon name={sidebar.hidden.includes(s.key) ? "eyeOff" : "eye"} size={15} />
            </button>
          </div>
        {/each}
      {:else}
        {#each shown as s (s.key)}
          <button
            class="item"
            class:active={isActive("section", s.key)}
            aria-current={isActive("section", s.key) ? "page" : undefined}
            onclick={() => open({ name: "section", key: s.key, title: s.title, kind: s.kind })}
            title={s.title}
          >
            <Icon name={icon(s.kind)} />
            <span class="label">{s.title}</span>
          </button>
        {/each}

        {#if hidden.length}
          <button class="item more" onclick={() => (sidebar.showHidden = !sidebar.showHidden)} title="Plus">
            <Icon name={sidebar.showHidden ? "chevronDown" : "chevronRight"} />
            <span class="label">Plus ({hidden.length})</span>
          </button>
          {#if sidebar.showHidden}
            {#each hidden as s (s.key)}
              <button
                class="item sub"
                class:active={isActive("section", s.key)}
            aria-current={isActive("section", s.key) ? "page" : undefined}
                onclick={() => open({ name: "section", key: s.key, title: s.title, kind: s.kind })}
                title={s.title}
              >
                <Icon name={icon(s.kind)} />
                <span class="label">{s.title}</span>
              </button>
            {/each}
          {/if}
        {/if}
      {/if}
    {/if}

    <div class="group"><span>Demandes</span></div>
    <button class="item" class:active={isActive("discover") || isActive("seerr")}
            aria-current={(isActive("discover") || isActive("seerr")) ? "page" : undefined} onclick={() => open({ name: "discover" })} title="Découvrir">
      <Icon name="compass" /> <span class="label">Découvrir</span>
    </button>
    <div class="group"><span>Tracearr</span></div>
    <button class="item" class:active={isActive("stats")}
            aria-current={isActive("stats") ? "page" : undefined} onclick={() => open({ name: "stats" })} title="Mes statistiques">
      <Icon name="stats" /> <span class="label">Mes statistiques</span>
    </button>
  </nav>

  <div class="spacer"></div>
  <button class="item settings" class:active={isActive("settings")}
            aria-current={isActive("settings") ? "page" : undefined} onclick={() => open({ name: "settings" })} title="Réglages">
    <Icon name="settings" />
    <span class="label">
      Réglages
      <small>{serverName}</small>
    </span>
  </button>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    padding: 14px 12px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 4px 16px;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .toggle {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--text-dim);
  }

  .toggle:hover {
    background: #ffffff12;
    color: var(--text);
  }

  .logo {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding-left: 2px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--accent-text);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--text-dim);
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .item :global(svg) {
    flex: none;
  }

  button.item:hover {
    background: #ffffff0d;
    color: var(--text);
  }

  .item.active {
    background: #ffffff12;
    color: var(--text);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .item.active :global(svg) {
    color: var(--accent);
  }

  .item.sub {
    padding-left: 24px;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .settings small {
    display: block;
    font-size: 11px;
    color: var(--text-faint);
  }

  .group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 12px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--text-faint);
  }

  .customize {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-faint);
  }

  .customize:hover,
  .customize.on {
    background: #ffffff14;
    color: var(--accent);
  }

  .hint {
    margin: 0 12px 6px;
    color: var(--text-faint);
    font-size: 11px;
    white-space: normal;
  }

  .item.edit {
    gap: 8px;
    padding-left: 6px;
    border: 1px dashed #ffffff1a;
    cursor: grab;
  }

  .item.edit.dragging {
    opacity: 0.4;
  }

  .item.edit.off .label {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  .grip {
    color: var(--text-faint);
  }

  .mini {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-dim);
  }

  .mini:first-of-type :global(svg) {
    transform: rotate(180deg);
  }

  .mini:hover {
    background: #ffffff14;
    color: var(--text);
  }

  .spacer {
    flex: 1;
  }

  /* ---------- Menu replié : seulement les icônes ---------- */

  .collapsed {
    padding: 14px 10px 16px;
  }

  .collapsed .brand {
    justify-content: center;
    padding: 0 0 16px;
  }

  .collapsed .item {
    justify-content: center;
    padding: 8px 0;
  }

  .collapsed .label,
  .collapsed .group span,
  .collapsed .hint {
    display: none;
  }

  .collapsed .group {
    padding: 10px 8px;
  }

  .collapsed .group::before {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .collapsed .item.sub {
    padding-left: 0;
  }
</style>

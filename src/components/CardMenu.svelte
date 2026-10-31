<script lang="ts">
  import { api, errorText, isMusic, type Item } from "../lib/api";
  import { go, nav, reload, toast } from "../lib/nav.svelte";
  import { play, playMusic } from "../lib/player.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n";

  // Menu « ⋮ » d'une jaquette : actions de lecture, puis gestion (administrateur seulement).
  const menu = $derived(nav.menu!);
  const item = $derived(menu.item);
  const music = $derived(isMusic(item.kind));
  const editable = $derived(item.kind !== "playlist");

  let el = $state<HTMLElement>();
  // Le menu reste dans la fenêtre, même ouvert près d'un bord.
  const pos = $derived.by(() => {
    const w = 240;
    const h = el?.offsetHeight ?? 300;
    return {
      left: Math.min(menu.x, window.innerWidth - w - 12),
      top: Math.min(menu.y, window.innerHeight - h - 12),
    };
  });

  function close() {
    nav.menu = null;
  }

  async function run(action: () => Promise<unknown>, done?: string) {
    close();
    try {
      await action();
      if (done) toast(done);
    } catch (e) {
      toast(errorText(e), true);
    }
  }

  function start(shuffle = false) {
    run(() => (music ? playMusic(item.ratingKey, { shuffle }) : play(item.ratingKey)));
  }

  function toggleWatched() {
    run(async () => {
      await api.setWatched(item.ratingKey, !item.watched);
      reload();
    }, item.watched ? t("cardMenu.markedUnwatched") : t("cardMenu.markedWatched"));
  }

  function edit() {
    nav.editing = item;
    close();
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && close()} onresize={close} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close} oncontextmenu={(e) => (e.preventDefault(), close())}></div>
<div class="menu" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" role="menu">
  <div class="head">{item.showTitle && item.kind === "episode" ? item.showTitle : item.title}</div>
  {#if item.playable || music}
    <button role="menuitem" onclick={() => start()}><Icon name="play" size={16} filled /> {t("common.c1.play")}</button>
  {/if}
  {#if music && item.kind !== "track"}
    <button role="menuitem" onclick={() => start(true)}><Icon name="shuffle" size={16} /> {t("common.c1.shuffle")}</button>
  {/if}
  {#if !music}
    <button role="menuitem" onclick={toggleWatched}>
      <Icon name="checkCircle" size={16} /> {item.watched ? t("cardMenu.markUnwatched") : t("cardMenu.markWatched")}
    </button>
  {/if}
  <button role="menuitem" onclick={() => (close(), go({ name: "item", ratingKey: item.ratingKey }))}>
    <Icon name="chevronRight" size={16} /> {t("cardMenu.openDetails")}
  </button>
  {#if nav.admin && editable}
    <div class="sep"></div>
    <button role="menuitem" onclick={edit}><Icon name="edit" size={16} /> {t("cardMenu.edit")}</button>
    <button role="menuitem" onclick={() => run(() => api.refreshMetadata(item.ratingKey), t("cardMenu.refreshStarted"))}>
      <Icon name="restart" size={16} /> {t("cardMenu.refreshMetadata")}
    </button>
    <button role="menuitem" onclick={() => run(() => api.analyze(item.ratingKey), t("cardMenu.analyzeStarted"))}>
      <Icon name="search" size={16} /> {t("cardMenu.analyze")}
    </button>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
  }

  .menu {
    position: fixed;
    z-index: 61;
    width: 240px;
    padding: 6px;
    border: 1px solid #ffffff1a;
    border-radius: 12px;
    background: #1c1e23f2;
    backdrop-filter: blur(18px);
    box-shadow: 0 18px 44px #000b;
    animation: pop 0.12s var(--ease);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }

  .head {
    padding: 8px 10px 6px;
    overflow: hidden;
    color: var(--text-faint);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: none;
    text-align: left;
    font-size: 13px;
  }

  button:hover {
    background: #ffffff14;
  }

  button :global(svg) {
    color: var(--text-dim);
  }

  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>

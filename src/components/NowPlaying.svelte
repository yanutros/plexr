<script lang="ts">
  import { formatClock } from "../lib/api";
  import { current, mpv, player } from "../lib/player.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "../lib/i18n";

  const track = $derived(current());
  const upNext = $derived(player.queue.slice(player.index + 1, player.index + 8));
</script>

<div class="now-playing">
  <div class="bg" style:background-image={track?.cover ? `url("${track.cover}")` : undefined}></div>

  <button class="close" onclick={() => (player.expanded = false)} aria-label={t("nowPlaying.collapse")}>
    <Icon name="chevronDown" size={26} />
  </button>

  <div class="body">
    <div class="main">
      <div class="cover" class:paused={player.paused}>
        {#if track?.cover}<img src={track.cover} alt="" />{:else}<Icon name="music" size={96} />{/if}
      </div>
      <h1>{track?.title ?? ""}</h1>
      <div class="sub">{[track?.artist, track?.album].filter(Boolean).join(" — ")}</div>
    </div>

    {#if upNext.length}
      <aside class="next">
        <div class="next-title">{t("nowPlaying.upNext")}</div>
        {#each upNext as qt, i (qt.ratingKey + i)}
          <button class="q" onclick={() => mpv("set_property", "playlist-pos", player.index + 1 + i)}>
            {#if qt.cover}<img src={qt.cover} alt="" loading="lazy" />{/if}
            <span class="q-text">
              <span class="q-title">{qt.title}</span>
              <span class="q-sub">{qt.artist ?? ""}</span>
            </span>
            <span class="q-dur">{formatClock(qt.durationMs / 1000)}</span>
          </button>
        {/each}
      </aside>
    {/if}
  </div>
</div>

<style>
  .now-playing {
    position: fixed;
    inset: 0 0 106px 0;
    z-index: 25;
    overflow: hidden;
    background: #0d0e10;
    animation: rise 0.3s var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
  }

  .bg {
    position: absolute;
    inset: -80px;
    background-size: cover;
    background-position: center;
    filter: blur(70px) saturate(1.5) brightness(0.45);
    transform: scale(1.1);
  }

  .close {
    position: absolute;
    z-index: 1;
    top: 18px;
    left: 18px;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: #0004;
    color: #fff;
  }

  .close:hover {
    background: #fff2;
  }

  .body {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 64px;
    height: 100%;
    padding: 40px;
  }

  .main {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    text-align: center;
  }

  .cover {
    display: grid;
    place-items: center;
    width: min(46vh, 460px);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 12px;
    background: var(--bg-elev);
    color: var(--text-faint);
    box-shadow: 0 30px 80px #000c;
    transition: transform 0.4s var(--ease);
  }

  .cover.paused {
    transform: scale(0.94);
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  h1 {
    margin: 28px 0 4px;
    font-size: 28px;
  }

  .sub {
    color: #fffb;
    font-size: 16px;
  }

  .next {
    width: 340px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .next-title {
    margin-bottom: 8px;
    color: #fff9;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .q {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 8px;
    background: none;
    text-align: left;
    color: #fff;
  }

  .q:hover {
    background: #ffffff14;
  }

  .q img {
    width: 44px;
    height: 44px;
    border-radius: 4px;
    object-fit: cover;
  }

  .q-text {
    display: grid;
    min-width: 0;
  }

  .q-title,
  .q-sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .q-sub,
  .q-dur {
    color: #fff9;
    font-size: 12px;
  }

  @media (max-width: 1100px) {
    .next {
      display: none;
    }
  }
</style>

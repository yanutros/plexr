<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorText, type ServerSummary } from "../lib/api";

  let { onDone }: { onDone: () => void } = $props();

  let servers = $state<ServerSummary[] | null>(null);
  let connecting = $state<string | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      servers = await api.servers();
    } catch (e) {
      error = errorText(e);
    }
  });

  async function select(s: ServerSummary) {
    connecting = s.machineId;
    error = null;
    try {
      await api.selectServer(s.machineId);
      onDone();
    } catch (e) {
      error = errorText(e);
    } finally {
      connecting = null;
    }
  }
</script>

<div class="center">
  <div class="card">
    <h2>Choisis un serveur</h2>
    {#if !servers && !error}
      <p class="muted">Recherche des serveurs…</p>
    {:else if servers && !servers.length}
      <p class="muted">Aucun serveur Plex accessible avec ce compte.</p>
    {/if}
    {#each servers ?? [] as s (s.machineId)}
      <button class="server" disabled={connecting !== null} onclick={() => select(s)}>
        <span>{s.name}</span>
        <span class="muted">
          {connecting === s.machineId ? "Connexion…" : s.owned ? "Mon serveur" : "Partagé"}
        </span>
      </button>
    {/each}
    {#if error}<p class="error">{error}</p>{/if}
    <button class="btn logout" onclick={() => api.logout().then(onDone)}>Changer de compte</button>
  </div>
</div>

<style>
  .card {
    width: 440px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .server {
    display: flex;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .server:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .logout {
    align-self: center;
    margin-top: 16px;
  }
</style>

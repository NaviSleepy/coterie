<script lang="ts">
  import type { TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  let newSecret = $state('');
  let subject = $state('');
  let revealTo = $state<Record<string, string>>({});

  const players = $derived(table.members.filter((m) => m.userId !== table.me));
  const secrets = $derived(Object.values(table.secrets).sort((a, b) => b.$createdAt.localeCompare(a.$createdAt)));

  function time(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function nameOfUser(id: string) {
    return table.members.find((m) => m.userId === id)?.name ?? 'Someone';
  }

  async function write() {
    if (!newSecret.trim()) return;
    const ok = await table.act('createSecret', {
      chronicleId: table.chronicleId,
      body: newSecret,
      subjectCharacterId: subject || undefined,
    });
    if (ok) {
      newSecret = '';
      subject = '';
    }
  }
</script>

<aside class="screen">
  <h2>Behind the screen</h2>

  <h3 class="label">Rolls &amp; difficulties</h3>
  {#each table.rolls.slice(0, 12) as r (r.$id)}
    {@const secret = table.rollSecrets[r.$id]}
    <div class="entry">
      <div class="head"><span><b>{r.characterName?.split(' ')[0]}</b> · {r.label}</span><time>{time(r.$createdAt)}</time></div>
      <div class="head">
        <span>Difficulty <b class="gold">{secret?.difficulty ?? '?'}</b> · {r.outcome === 'success' ? `${r.netSuccesses} success${r.netSuccesses === 1 ? '' : 'es'}` : r.outcome}</span>
        {#if r.visibility === 'storyteller'}<span class="tag">Hidden from table</span>{/if}
      </div>
      {#if secret && !secret.revealed}
        <button class="btn gold" onclick={() => table.act('revealRoll', { rollId: r.$id })}>
          Break the seal — reveal to table
        </button>
      {/if}
    </div>
  {:else}
    <p class="quiet">Nothing rolled yet.</p>
  {/each}

  <h3 class="label">Secrets</h3>
  {#each secrets as s (s.$id)}
    <div class="entry">
      <p>{s.body}</p>
      <div class="known">
        <span class="quiet">Known to</span>
        {#each s.visibleTo ?? [] as id (id)}<span class="tag plain">{nameOfUser(id)}</span>{:else}<span class="quiet">you alone</span>{/each}
      </div>
      <div class="reveal">
        <select bind:value={revealTo[s.$id]} aria-label="Reveal to">
          <option value="">Reveal to…</option>
          {#each players.filter((p) => !(s.visibleTo ?? []).includes(p.userId)) as p (p.userId)}
            <option value={p.userId}>{p.name}</option>
          {/each}
        </select>
        <button
          class="btn solid"
          disabled={!revealTo[s.$id]}
          onclick={async () => {
            await table.act('revealSecret', { secretId: s.$id, userId: revealTo[s.$id] });
            revealTo[s.$id] = '';
          }}>Reveal</button>
      </div>
    </div>
  {/each}

  <form class="write" onsubmit={(e) => { e.preventDefault(); void write(); }}>
    <textarea bind:value={newSecret} rows="3" placeholder="Write something down behind the screen…"></textarea>
    <div class="reveal">
      <select bind:value={subject} aria-label="Concerns">
        <option value="">Concerns no one in particular</option>
        {#each table.coterie as c (c.$id)}<option value={c.$id}>Concerns {table.nameOf(c.$id)}</option>{/each}
      </select>
      <button class="btn gold" type="submit" disabled={!newSecret.trim()}>Seal it</button>
    </div>
  </form>
</aside>

<style>
  .screen {
    background: var(--screen);
    color: var(--screen-ink);
    padding: 28px;
    display: grid;
    gap: 14px;
    align-content: start;
  }
  h2 {
    margin: 0;
    font-style: italic;
    font-weight: 500;
    font-size: 1.7rem;
  }
  h3 {
    margin: 12px 0 0;
    color: var(--gold-soft);
    border-bottom: 1px solid var(--screen-rule);
    padding-bottom: 6px;
  }
  .entry {
    border-bottom: 1px solid var(--screen-rule);
    padding-bottom: 12px;
    display: grid;
    gap: 6px;
    justify-items: start;
  }
  .entry p {
    margin: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    flex-wrap: wrap;
  }
  time,
  .quiet {
    color: #a8958e;
  }
  .gold {
    color: var(--gold-soft);
  }
  .tag {
    font-family: var(--caps);
    font-variant: small-caps;
    border: 1px solid #b4414e;
    color: #efb9bf;
    padding: 0 0.5em;
    font-size: 0.85rem;
  }
  .tag.plain {
    border-color: var(--screen-rule);
    color: var(--screen-ink);
    font-family: var(--serif);
    font-variant: normal;
  }
  .known,
  .reveal {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  select,
  textarea {
    background: transparent;
    color: var(--screen-ink);
    border-color: var(--screen-rule);
  }
  option {
    color: var(--ink);
  }
  .write {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .btn.solid {
    border-color: var(--oxblood);
  }
</style>

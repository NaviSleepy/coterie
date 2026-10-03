<script lang="ts">
  /**
   * New characters built over the creation budget. The Storyteller sees every
   * one, with the budget in words and the traits that cost the most, and
   * approves it (the sheet is created as sent, owned by the player) or
   * declines it with a note. A player sees their own, with the note, and can
   * withdraw.
   */
  import { traitLabel } from '$engine/index.ts';
  import { parseJson } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  type Named = { name: string; level?: number; points?: number };
  const requests = $derived(
    Object.values(table.creationRequests)
      .filter((r) => table.isStoryteller || r.ownerId === table.me)
      .sort((a, b) => String(a.$createdAt).localeCompare(String(b.$createdAt)))
      .map((r) => {
        const profile = parseJson<Record<string, string>>(r.profile, {});
        const sheet = parseJson<Record<string, any>>(r.sheet, {});
        const high = Object.entries({ ...(sheet.attributes ?? {}), ...(sheet.abilities ?? {}) } as Record<string, number>)
          .filter(([, v]) => v >= 4)
          .map(([k, v]) => `${traitLabel(k)} ${v}`);
        const list = (xs: Named[] | undefined, unit: (x: Named) => string) => (xs ?? []).map((x) => `${x.name} ${unit(x)}`).join(', ');
        return {
          r,
          profile,
          lineage: sheet.template === 'dhampir' ? ['Dhampir', sheet.clan].filter(Boolean).join(' · ') : [sheet.clan || 'Caitiff', `${sheet.generation}th Generation`, sheet.sect].filter(Boolean).join(' · '),
          high,
          disciplines: list(sheet.disciplines, (d) => String(d.level)),
          backgrounds: list(sheet.backgrounds, (b) => String(b.level)),
          merits: list(sheet.merits, (m) => `(${m.points})`),
          flaws: list(sheet.flaws, (f) => `(${f.points})`),
          cost: parseJson<string[]>(r.cost, []),
          player: table.members.find((m) => m.userId === r.ownerId)?.name ?? 'A player',
        };
      }),
  );
  let notes = $state<Record<string, string>>({});
</script>

{#if requests.length}
  <section class="requests panel" aria-label="Characters waiting for approval">
    <h2>{table.isStoryteller ? 'New characters waiting for you' : 'Waiting for the Storyteller'}</h2>
    {#if !table.isStoryteller}<p class="hint">These go over the creation budget, so the Storyteller decides. Once approved, the character takes its seat exactly as you built it.</p>{/if}
    {#each requests as q (q.r.$id)}
      <article class:declined={q.r.status === 'declined'}>
        <header>
          <h3>{q.profile.name}{#if table.isStoryteller} <span class="who">· {q.player}</span>{/if}</h3>
          <span class="state">{q.r.status === 'declined' ? 'Declined' : table.isStoryteller ? 'Waiting for you' : 'Waiting'}</span>
        </header>
        <p class="lineage caps">{q.lineage}</p>
        {#if q.profile.concept}<p class="hint">{q.profile.concept}</p>{/if}
        <ul class="cost">{#each q.cost as l (l)}<li>{l}</li>{/each}</ul>
        <dl>
          {#if q.high.length}<div><dt>4+ dots</dt><dd>{q.high.join(', ')}</dd></div>{/if}
          {#if q.disciplines}<div><dt>Disciplines</dt><dd>{q.disciplines}</dd></div>{/if}
          {#if q.backgrounds}<div><dt>Backgrounds</dt><dd>{q.backgrounds}</dd></div>{/if}
          {#if q.merits}<div><dt>Merits</dt><dd>{q.merits}</dd></div>{/if}
          {#if q.flaws}<div><dt>Flaws</dt><dd>{q.flaws}</dd></div>{/if}
        </dl>
        {#if q.r.status === 'declined' && q.r.note}<p class="note">“{q.r.note}”</p>{/if}
        <div class="row">
          {#if table.isStoryteller && q.r.status !== 'declined'}
            <button class="btn solid" onclick={() => table.act('character', { action: 'approveCreation', requestId: q.r.$id })}>Approve</button>
            <input bind:value={notes[q.r.$id]} placeholder="Why not (optional)" aria-label="Reason for declining" />
            <button class="btn quiet" onclick={() => table.act('character', { action: 'declineCreation', requestId: q.r.$id, note: notes[q.r.$id] ?? '' })}>Decline</button>
          {:else if !table.isStoryteller}
            <button class="btn quiet" onclick={() => table.act('character', { action: 'withdrawCreation', requestId: q.r.$id })}>{q.r.status === 'declined' ? 'Dismiss' : 'Withdraw'}</button>
          {/if}
        </div>
      </article>
    {/each}
    {#if table.error}<p class="error">{table.error}</p>{/if}
  </section>
{/if}

<style>
  .requests {
    display: grid;
    gap: 14px;
  }
  h2 {
    font-weight: 500;
    margin: 0;
  }
  article {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--rule);
    padding-top: 10px;
  }
  article.declined {
    opacity: 0.75;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
  }
  h3 {
    margin: 0;
    font-weight: 500;
  }
  .who,
  .state,
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  .hint {
    margin: 0;
  }
  .lineage {
    color: var(--oxblood);
    margin: 0;
    font-size: 0.85rem;
  }
  .cost {
    margin: 0;
    padding-left: 1.1em;
    color: var(--oxblood);
  }
  dl {
    margin: 0;
    display: grid;
    gap: 2px;
    font-size: 0.92rem;
  }
  dl div {
    display: flex;
    gap: 0.5em;
  }
  dt {
    color: var(--ink-soft);
    min-width: 6.5em;
  }
  dd {
    margin: 0;
  }
  .note {
    margin: 0;
    font-style: italic;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row input {
    flex: 1;
    min-width: 140px;
  }
</style>

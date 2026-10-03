<script lang="ts">
  import type { TableState } from '$lib/table.svelte';
  import { parseJson } from '$shared/codec.ts';
  import Die from './Die.svelte';

  let { table }: { table: TableState } = $props();

  function time(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function verdict(r: any): string {
    if (r.refusal) return 'No dice';
    if (r.outcome === 'botch') return 'Botch';
    if (r.outcome === 'failure') return 'Failure';
    return r.netSuccesses === 1 ? '1 success' : `${r.netSuccesses} successes`;
  }

  function who(r: any): string {
    const mine = table.characters[r.characterId]?.ownerId === table.me && !table.isStoryteller;
    return mine ? 'You' : (r.characterName?.split(' ')[0] ?? 'Someone');
  }

  /** A degeneration check's note splits into the sin, in the Storyteller's words, and what it cost. */
  function reckoning(r: any): { sin: string; change: string; fell: boolean } | null {
    if (r.kind !== 'degeneration' || !r.note) return null;
    const m = /^(.*) — (.+ (falls to|holds at) \d+)$/s.exec(r.note);
    return m ? { sin: m[1], change: m[2], fell: m[3] === 'falls to' } : null;
  }

  function detail(r: any): string {
    const parts: string[] = [];
    const d = r.revealedDifficulty ?? table.rollSecrets[r.$id]?.difficulty;
    if (r.kind === 'degeneration' && r.revealedDifficulty) parts.push(`Difficulty ${d}`);
    else if (r.revealedDifficulty) parts.push(`Difficulty ${d} · revealed by the Storyteller`);
    else if (table.isStoryteller && d) parts.push(`Difficulty ${d}`);
    if (r.woundPenalty) parts.push(`−${r.woundPenalty} wounds`);
    if (r.ones && r.outcome !== 'success') parts.push(`${r.ones === 1 ? 'a 1' : `${r.ones} 1s`} cancel`);
    if (r.willpowerSpent) parts.push('Willpower spent');
    if (r.note && !reckoning(r)) parts.push(r.note);
    if (r.refusal) parts.push(r.refusal);
    return parts.join(' · ');
  }
</script>

<section class="feed" aria-live="polite">
  <header>
    <h2>The night so far</h2>
    <span class="status {table.status}">{table.status === 'live' ? 'live' : table.status === 'reconnecting' ? 'reconnecting…' : '…'}</span>
  </header>

  {#if table.rolls.length === 0}
    <p class="empty">No dice have fallen yet.</p>
  {/if}

  {#each table.rolls as r (r.$id)}
    {@const dice = parseJson<{ value: number; rerolled: boolean }[]>(r.dice, [])}
    {@const difficulty = r.revealedDifficulty ?? (table.isStoryteller ? (table.rollSecrets[r.$id]?.difficulty ?? null) : null)}
    <article class:fresh={table.fresh[r.$id]} class:missed={table.replayed[r.$id]} class:hidden={r.visibility === 'storyteller'}>
      <div class="head">
        <span><b>{who(r)}</b> · {r.label}</span>
        <time datetime={r.$createdAt}>{time(r.$createdAt)}</time>
      </div>
      <div class="body">
        <div class="dice">
          {#each dice as d, i (i)}
            <Die value={d.value} rerolled={d.rerolled} {difficulty} animate={!!table.fresh[r.$id]} delay={i * 70} />
          {/each}
        </div>
        <span class="verdict {r.outcome}">{verdict(r)}</span>
      </div>
      {#if reckoning(r)}
        {@const k = reckoning(r)!}
        <p class="sin">“{k.sin}”</p>
        <p class="change" class:fell={k.fell}>{k.change}</p>
      {/if}
      {#if detail(r)}<p class="detail">{detail(r)}</p>{/if}
      {#if table.replayed[r.$id]}<p class="detail away">While you were away</p>{/if}
      {#if r.visibility === 'storyteller'}<p class="detail hidden-tag">Hidden from the table</p>{/if}
    </article>
  {/each}
</section>

<style>
  .sin {
    margin: 6px 0 2px;
    font-style: italic;
    overflow-wrap: anywhere;
  }
  .change {
    margin: 0;
    font-weight: 600;
  }
  .change.fell {
    color: var(--oxblood);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-weight: 500;
    font-size: 1.5rem;
  }
  .status {
    font-size: 0.85rem;
    color: var(--ink-faint);
  }
  .status.reconnecting {
    color: var(--oxblood);
    font-style: italic;
  }
  article {
    padding: 12px 0;
    border-bottom: 1px solid var(--rule);
  }
  article.fresh {
    animation: arrive 0.6s ease;
  }
  article.missed {
    border-left: 2px solid var(--gold);
    padding-left: 10px;
  }
  article.hidden {
    opacity: 0.8;
  }
  @keyframes arrive {
    from {
      background: color-mix(in oklab, var(--gold) 18%, transparent);
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    font-size: 0.95rem;
  }
  time {
    color: var(--ink-faint);
    font-variant-numeric: lining-nums;
  }
  .body {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1em;
    margin-top: 6px;
  }
  .dice {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .verdict {
    font-style: italic;
    font-size: 1.15rem;
    white-space: nowrap;
  }
  .verdict.botch {
    color: var(--oxblood);
  }
  .detail {
    margin: 6px 0 0;
    font-size: 0.85rem;
    font-style: italic;
    color: var(--ink-soft);
  }
  .away {
    color: var(--gold);
  }
  .hidden-tag {
    font-style: normal;
    font-family: var(--caps);
    font-variant: small-caps;
    color: var(--oxblood);
  }
  .empty {
    color: var(--ink-faint);
    font-style: italic;
  }
</style>

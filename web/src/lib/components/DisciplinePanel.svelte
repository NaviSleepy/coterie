<script lang="ts">
  /**
   * What the character's Disciplines do, level by level, and which
   * combination powers their ratings open up — read from the table's library,
   * so it says whatever the Storyteller's write-ups say.
   */
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { combosFor, disciplineLevels, needsLabel, ritualsWithinReach } from '$lib/library';

  let { table, character }: { table: TableState; character: Character } = $props();

  const levels = $derived(disciplineLevels(table.library, character.disciplines ?? []));
  const combos = $derived(combosFor(table.library, character.disciplines ?? []));
  const rituals = $derived(ritualsWithinReach(table.library, character.disciplines ?? []));
  const known = $derived(new Set((character.rituals ?? []).map((r) => r.name.trim().toLowerCase())));
  const dots = (n: number) => '•'.repeat(Math.min(n, 5)) + (n > 5 ? ` ${'•'.repeat(n - 5)}` : '');
</script>

{#if levels.length}
  <section class="panel side" aria-label="Disciplines">
    <h2 class="label">Disciplines</h2>
    {#each levels as d (d.name)}
      <details open>
        <summary><span>{d.name}</span> <span class="dots">{dots(d.level)}</span></summary>
        {#if d.paths.length}
          <p class="hint">Name the path to see its powers, e.g. “{d.name} ({d.paths[0]})”. Paths in the library: {d.paths.join(', ')}.</p>
        {:else if !d.powers.length}
          <p class="hint">Nothing in the library for this yet.</p>
        {/if}
        <ol>
          {#each d.powers as p (p.entry.$id)}
            <li title={p.entry.page || undefined}>
              <span class="lvl">{dots(p.needs[0][0].level)}</span>
              <b>{p.entry.name}</b>
              <span class="text">{p.text}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/each}

    {#if combos.length}
      <h3 class="label">Combinations open to you</h3>
      <ul class="combos">
        {#each combos as p (p.entry.$id)}
          <li title={p.entry.page || undefined}>
            <b>{p.entry.name}</b> <span class="needs">{needsLabel(p)}</span>
            <span class="text">{p.text}</span>
          </li>
        {/each}
      </ul>
      <p class="hint">Each combination is learned separately, with the Storyteller's leave.</p>
    {/if}

    {#each rituals as g (g.tradition)}
      <details class="rituals">
        <summary><span>{g.tradition} rituals within reach</span> <span class="count">{g.rituals.filter((r) => known.has(String(r.entry.name).toLowerCase())).length} known of {g.rituals.length}</span></summary>
        <ul class="combos">
          {#each g.rituals as r (r.entry.$id)}
            <li title={r.entry.page || undefined}>
              <b>{r.entry.name}</b> <span class="needs">Level {r.level}{known.has(String(r.entry.name).toLowerCase()) ? ' · known' : ''}</span>
              <span class="text">{r.text}</span>
            </li>
          {/each}
        </ul>
        <p class="hint">Rituals are learned one at a time, up to your {g.tradition} rating.</p>
      </details>
    {/each}
  </section>
{/if}

<style>
  .side {
    display: grid;
    gap: 10px;
  }
  h2,
  h3 {
    margin: 0;
  }
  h3 {
    margin-top: 8px;
  }
  details {
    border-top: 1px solid var(--rule);
    padding-top: 8px;
  }
  summary {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 1.1rem;
  }
  .dots,
  .lvl {
    letter-spacing: 0.05em;
    color: var(--oxblood);
    white-space: nowrap;
  }
  ol,
  ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    gap: 2px;
  }
  ol li {
    grid-template-columns: auto 1fr;
    column-gap: 8px;
  }
  ol li .text {
    grid-column: 2;
  }
  .text,
  .hint {
    color: var(--ink-soft);
    font-size: 0.92rem;
  }
  .hint {
    font-style: italic;
    margin: 4px 0 0;
  }
  .count {
    color: var(--ink-faint);
    font-size: 0.9rem;
  }
  .needs {
    font-family: var(--caps);
    font-variant: small-caps;
    color: var(--ink-faint);
    font-size: 0.85rem;
  }
</style>

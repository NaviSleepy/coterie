<script lang="ts">
  /**
   * A player sees what they've been shown, and a closed seal for every secret
   * that concerns their character but hasn't been shown to them: something
   * exists behind the door, and they know it. The seal row carries a count,
   * never the text — the text is on a row they cannot read.
   */
  import type { TableState } from '$lib/table.svelte';
  import WaxSeal from './WaxSeal.svelte';

  let { table }: { table: TableState } = $props();

  const known = $derived(Object.values(table.secrets));
  // A seal whose secret is readable has been opened; show the text instead.
  const sealed = $derived(Object.values(table.seals).filter((s) => !table.secrets[s.$id]));
</script>

{#if known.length || sealed.length}
  <section class="secrets" aria-label="Secrets">
    {#each sealed as seal (seal.$id)}
      <article class="card sealed">
        <div class="head">
          <WaxSeal size={46} />
          <div>
            <span class="label">Sealed</span>
            <h3>A secret concerns you</h3>
          </div>
        </div>
        <div class="redaction" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <p class="foot">
          Held by the Storyteller.
          {seal.knownCount === 0
            ? 'Known to no one else at this table.'
            : `Known to ${seal.knownCount === 1 ? 'one other' : `${seal.knownCount} others`} at this table.`}
        </p>
      </article>
    {/each}
    {#each known as s (s.$id)}
      <article class="card open">
        <span class="label">Broken seal{s.subjectCharacterId ? ` · concerns ${table.nameOf(s.subjectCharacterId)}` : ''}</span>
        <p>{s.body}</p>
      </article>
    {/each}
  </section>
{/if}

<style>
  .secrets {
    display: grid;
    gap: 16px;
  }
  .card {
    background: #efe3cf;
    border: 1px solid var(--rule);
    padding: 22px;
    color: #1d1416;
  }
  .head {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  h3 {
    margin: 0;
    font-weight: 500;
    font-size: 1.4rem;
  }
  .redaction {
    display: grid;
    gap: 9px;
    margin: 18px 0;
  }
  .redaction span {
    height: 13px;
    background: #1d1416;
  }
  .redaction span:nth-child(1) { width: 96%; }
  .redaction span:nth-child(2) { width: 82%; }
  .redaction span:nth-child(3) { width: 89%; }
  .redaction span:nth-child(4) { width: 40%; }
  .foot {
    margin: 0;
    font-style: italic;
    font-size: 0.9rem;
    color: #5b4b4d;
  }
  .open p {
    margin: 6px 0 0;
  }
</style>

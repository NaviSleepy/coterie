<script lang="ts">
  /**
   * The player's side of a proposal. Edits save as they're made, a moment
   * after typing stops, so the Storyteller watches the draft take shape. The
   * sheet itself doesn't change until the Storyteller approves.
   */
  import { parseJson, type Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { changesFrom, describe, draftOf, type Draft } from '$lib/sheet-edit';
  import SheetEditor from './SheetEditor.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  const proposal = $derived(table.proposals[character.$id]);
  const proposed = $derived(parseJson<Partial<Draft>>(proposal?.sheet, {}));
  const lines = $derived(proposal ? describe(character, proposed) : []);

  let editing = $state(false);
  let draft = $state<Draft | null>(null);
  let saving = $state(false);
  let lastSent = '';

  function open() {
    draft = draftOf(character, proposed);
    lastSent = JSON.stringify(changesFrom(character, draft));
    editing = true;
  }

  async function send(changes: string) {
    saving = true;
    const out = await table.act('character', { action: 'propose', characterId: character.$id, sheet: JSON.parse(changes) });
    saving = false;
    if (out) lastSent = changes;
  }

  // Save a moment after the last edit, and only when something differs.
  $effect(() => {
    if (!editing || !draft) return;
    const changes = JSON.stringify(changesFrom(character, draft));
    if (changes === lastSent) return;
    const t = setTimeout(() => void send(changes), 700);
    return () => clearTimeout(t);
  });

  async function withdraw() {
    await table.act('character', { action: 'withdraw', characterId: character.$id });
    editing = false;
    draft = null;
  }
</script>

<section class="proposal panel">
  <header>
    <div>
      <h2>Changes to your sheet</h2>
      {#if !proposal}
        <p class="hint">Propose new dots, merits or flaws. The Storyteller sees your draft as you write it and approves it into the sheet.</p>
      {:else if proposal.status === 'declined'}
        <p class="declined">The Storyteller declined{proposal.note ? `: “${proposal.note}”` : '.'} Edit it to ask again.</p>
      {:else}
        <p class="hint">{saving ? 'Saving…' : 'Waiting for the Storyteller. They can see this now.'}</p>
      {/if}
    </div>
    <div class="actions">
      {#if editing}
        <button class="btn" onclick={() => (editing = false)} disabled={saving}>Done</button>
      {:else}
        <button class="btn" onclick={open}>{proposal ? 'Keep editing' : 'Propose changes'}</button>
      {/if}
      {#if proposal}<button class="btn quiet" onclick={withdraw}>Withdraw</button>{/if}
    </div>
  </header>

  {#if lines.length}
    <ul class="lines">{#each lines as l (l)}<li>{l}</li>{/each}</ul>
  {/if}

  {#if editing && draft}
    <SheetEditor bind:draft library={table.library} />
  {/if}
</section>

<style>
  .proposal {
    display: grid;
    gap: 12px;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h2 {
    font-weight: 500;
    margin: 0 0 4px;
  }
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    margin: 0;
  }
  .declined {
    color: var(--oxblood);
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: start;
  }
  .lines {
    margin: 0;
    padding-left: 1.2em;
    columns: 2 220px;
  }
</style>

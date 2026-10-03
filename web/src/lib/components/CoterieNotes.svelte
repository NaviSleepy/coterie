<script lang="ts">
  /**
   * The coterie's shared notes: everyone at the table reads and edits one
   * page. Edits arrive live. If someone else saves while you're typing,
   * nothing is overwritten silently: you choose whose words stay.
   */
  import { onDestroy, onMount } from 'svelte';
  import { NOTE_MAX, type TableState } from '$lib/table.svelte';
  import type { AnyRow } from '$lib/appwrite';

  let { table }: { table: TableState } = $props();

  const DEBOUNCE_MS = 1000;
  let body = $state('');
  let base = $state(''); // $updatedAt of the version the text was built on
  let saved = '';
  let inflight: string | null = null;
  let status = $state<'loading' | 'saved' | 'dirty' | 'saving' | 'failed'>('loading');
  let conflict = $state<AnyRow | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => void table.openCoterieNotes());

  // Someone's edit arrives: take it if you have nothing unsaved, else ask.
  $effect(() => {
    const row = table.coterieNote;
    if (!row || row.$updatedAt === base) return;
    if (status === 'loading' || status === 'saved') {
      body = saved = (row.body as string) ?? '';
      base = row.$updatedAt;
      status = 'saved';
    } else if (inflight !== null && row.body === inflight) {
      base = row.$updatedAt; // our own save, echoed back
    } else if (status !== 'saving') {
      conflict = row;
      clearTimeout(timer);
    }
  });

  async function save() {
    clearTimeout(timer);
    if (conflict || body === saved || status === 'loading') return;
    const text = body;
    inflight = text;
    status = 'saving';
    const out = await table.saveCoterieNote(text, base);
    inflight = null;
    if (!out) {
      status = 'failed';
    } else if ('conflict' in out) {
      conflict = out.conflict;
      status = 'dirty';
    } else {
      saved = text;
      base = out.row.$updatedAt;
      status = body === saved ? 'saved' : 'dirty';
      if (status === 'dirty') schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void save(), DEBOUNCE_MS);
  }

  function keepMine() {
    base = conflict!.$updatedAt;
    conflict = null;
    void save();
  }

  function takeTheirs() {
    body = saved = (conflict!.body as string) ?? '';
    base = conflict!.$updatedAt;
    conflict = null;
    status = 'saved';
  }

  const flush = () => void save();
  onMount(() => {
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });
  onDestroy(flush);

  const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const label = $derived(
    { loading: 'Opening…', saved: 'Saved', dirty: 'Unsaved', saving: 'Saving…', failed: "Couldn't save — try again" }[status],
  );
</script>

<p class="hint">
  Everyone at the table reads and edits these.
  {#if table.coterieNote?.editedBy}Last edited by {table.coterieNote.editedBy}, {when(table.coterieNote.$updatedAt)}.{/if}
  <span class="status" class:failed={status === 'failed'} aria-live="polite">{label}</span>
</p>
{#if conflict}
  <div class="conflict" role="alert">
    <p><b>{conflict.editedBy ?? 'Someone'}</b> changed these notes while you were typing.</p>
    <details>
      <summary>See their version</summary>
      <pre>{conflict.body}</pre>
    </details>
    <div class="row">
      <button class="btn solid" onclick={keepMine}>Keep mine</button>
      <button class="btn quiet" onclick={takeTheirs}>Take theirs</button>
    </div>
  </div>
{/if}
<textarea
  bind:value={body}
  oninput={() => { status = 'dirty'; schedule(); }}
  onblur={flush}
  maxlength={NOTE_MAX}
  disabled={status === 'loading'}
  placeholder="The coterie's haven, debts owed, who to watch…"
  aria-label="Coterie notes"
></textarea>

<style>
  .hint {
    margin: 0;
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  .status {
    font-style: normal;
    color: var(--ink-faint);
    margin-left: 0.4em;
  }
  .status.failed {
    color: var(--oxblood);
  }
  .conflict {
    border: 1px solid var(--oxblood);
    padding: 10px 12px;
    display: grid;
    gap: 8px;
  }
  .conflict p {
    margin: 0;
  }
  pre {
    white-space: pre-wrap;
    font: inherit;
    margin: 6px 0 0;
    max-height: 30vh;
    overflow: auto;
    overflow-wrap: anywhere;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 12em;
    field-sizing: content;
    max-height: 70vh;
    resize: vertical;
    line-height: 1.5;
    font-size: 1.05rem;
  }
</style>

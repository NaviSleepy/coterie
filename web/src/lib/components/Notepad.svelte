<script lang="ts">
  /**
   * A private notepad for this table: names, debts, suspicions, whatever the
   * night needs remembering. Only its author reads it, not even the
   * Storyteller. Saves itself a moment after you stop typing, and on leaving.
   */
  import { onDestroy, onMount } from 'svelte';
  import { NOTE_MAX, type TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  const DEBOUNCE_MS = 800;
  let body = $state('');
  let saved = '';
  let status = $state<'loading' | 'saved' | 'dirty' | 'saving' | 'failed'>('loading');
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Loads whoever is seated: the demo can swap seats under a mounted page.
  $effect(() => {
    const who = table.me;
    clearTimeout(timer);
    status = 'loading';
    table
      .loadNote()
      .then((text) => {
        if (who !== table.me) return;
        body = saved = text;
        status = 'saved';
      })
      .catch(() => (status = 'failed'));
  });

  async function save() {
    clearTimeout(timer);
    if (body === saved || status === 'loading') return;
    const text = body;
    status = 'saving';
    const ok = await table.saveNote(text);
    if (ok) saved = text;
    status = !ok ? 'failed' : body === saved ? 'saved' : 'dirty';
    if (status === 'dirty') schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void save(), DEBOUNCE_MS);
  }

  function input() {
    status = 'dirty';
    schedule();
  }

  const flush = () => void save();
  onMount(() => {
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });
  onDestroy(flush);

  const label = $derived(
    { loading: 'Opening…', saved: 'Saved', dirty: 'Unsaved', saving: 'Saving…', failed: "Couldn't save — keep this tab open and try again" }[status],
  );
</script>

<section class="notepad panel" aria-label="Notepad">
  <header>
    <h2>Notepad</h2>
    <span class="status" class:failed={status === 'failed'} aria-live="polite">{label}</span>
  </header>
  <p class="hint">Only you can read this, not even {table.isStoryteller ? 'your players' : 'the Storyteller'}.</p>
  <textarea
    bind:value={body}
    oninput={input}
    onblur={flush}
    maxlength={NOTE_MAX}
    disabled={status === 'loading'}
    placeholder="Names, debts, who lied to whom…"
    aria-label="Your notes"
  ></textarea>
  {#if body.length > NOTE_MAX * 0.9}<p class="hint">{body.length} / {NOTE_MAX} characters</p>{/if}
</section>

<style>
  .notepad {
    display: grid;
    gap: 8px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-weight: 500;
  }
  .status {
    font-size: 0.85rem;
    color: var(--ink-faint);
  }
  .status.failed {
    color: var(--oxblood);
  }
  .hint {
    margin: 0;
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
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

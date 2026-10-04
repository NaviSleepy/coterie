<script lang="ts">
  /**
   * A private notepad for this table: names, debts, suspicions, whatever the
   * night needs remembering. Only its author reads it, not even the
   * Storyteller. Saves itself a moment after you stop typing, and on leaving.
   */
  import { onDestroy, onMount } from 'svelte';
  import { NOTE_MAX, type TableState } from '$lib/table.svelte';
  import CoterieNotes from './CoterieNotes.svelte';
  import { countPhrase, oldSport } from '$lib/oldsport.svelte';
  import { theme } from '$lib/theme.svelte';

  let { table }: { table: TableState } = $props();

  const DEBOUNCE_MS = 800;
  let tab = $state<'mine' | 'coterie'>('mine');
  // The shared page opens the first time its tab is shown, then stays mounted so nothing unsaved is lost.
  let sharedOpened = $state(false);
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
        sports = countPhrase(text);
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

  // Jazz Age: a fresh "Old Sport" in your own notes opens the back room.
  let sports = 0;
  let toast = $state<string | null>(null);
  function input() {
    status = 'dirty';
    schedule();
    const n = countPhrase(body);
    if (n > sports && theme.id === 'jazz' && !oldSport.unlocked) {
      oldSport.unlock();
      toast = 'Why, old sport. The back room is open. Your dice come to the wheel now.';
      setTimeout(() => (toast = null), 4500);
    }
    sports = n;
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
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'mine'} class:on={tab === 'mine'} onclick={() => (tab = 'mine')}>Mine</button>
      <button role="tab" aria-selected={tab === 'coterie'} class:on={tab === 'coterie'} onclick={() => { tab = 'coterie'; sharedOpened = true; }}>Coterie</button>
    </div>
  </header>
  <div class="pane" hidden={tab !== 'mine'}>
    <p class="hint">
      Only you can read this, not even {table.isStoryteller ? 'your players' : 'the Storyteller'}.
      <span class="status" class:failed={status === 'failed'} aria-live="polite">{label}</span>
    </p>
    <textarea
      bind:value={body}
      oninput={input}
      onblur={flush}
      maxlength={NOTE_MAX}
      disabled={status === 'loading'}
      placeholder="Names, debts, who lied to whom…"
      aria-label="Your notes"
    ></textarea>
    {#if toast}<p class="sport" role="status">{toast}</p>{/if}
    {#if body.length > NOTE_MAX * 0.9}<p class="hint">{body.length} / {NOTE_MAX} characters</p>{/if}
  </div>
  {#if sharedOpened}
    <div class="pane" hidden={tab !== 'coterie'}><CoterieNotes {table} /></div>
  {/if}
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
    font-style: normal;
    font-size: 0.85rem;
    color: var(--ink-faint);
    margin-left: 0.4em;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 2px 8px;
    font-family: var(--caps);
    letter-spacing: 0.04em;
    color: var(--ink-soft);
  }
  .tabs button.on {
    color: var(--ink);
    border-bottom-color: var(--oxblood);
  }
  .sport {
    margin: 0;
    padding: 8px 12px;
    background: #113a29;
    color: #e9cf8a;
    border: 1px solid #d4ad55;
    font-style: italic;
    animation: sport 0.5s ease;
  }
  @keyframes sport {
    from { opacity: 0; transform: translateY(-4px); }
  }
  .pane {
    display: grid;
    gap: 8px;
  }
  .pane[hidden] {
    display: none;
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

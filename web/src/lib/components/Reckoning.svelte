<script lang="ts">
  /**
   * A sin laid before the player's character. The Storyteller named it; the
   * player faces it by pressing and holding, because a degeneration check that
   * takes one click cheapens it. Letting go early cancels. The roll itself is
   * the server's: this only asks for it, then shows what the dice decided.
   */
  import { traitDots, traitLabel, virtueForCheck } from '$engine/index.ts';
  import { sheetOf, type Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import PathDrop from './PathDrop.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  const HOLD_MS = 1800;

  const laid = $derived(table.reckonings[character.$id]);
  const virtue = $derived(virtueForCheck(character.virtues, 'degeneration'));
  const dice = $derived(traitDots(sheetOf(character), virtue));

  let progress = $state(0);
  let holding = $state(false);
  let rolling = $state(false);
  let result = $state<{ sin: string; path: string; from: number; to: number; outcome: string } | null>(null);
  let frame = 0;
  let started = 0;

  function begin() {
    if (holding || rolling || !laid) return;
    holding = true;
    started = performance.now();
    const tick = (now: number) => {
      if (!holding) return;
      progress = Math.min(1, (now - started) / HOLD_MS);
      if (progress >= 1) void face();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function cancel() {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(frame);
    progress = 0;
  }

  async function face() {
    holding = false;
    rolling = true;
    const sin = laid?.sin as string;
    const from = character.pathRating;
    const path = character.path;
    const roll = await table.act<{ outcome: string }>('virtueCheck', { characterId: character.$id, kind: 'degeneration', action: 'face' });
    rolling = false;
    progress = 0;
    if (roll) result = { sin, path, from, to: roll.outcome === 'success' ? from : Math.max(0, from - 1), outcome: roll.outcome };
  }

  function key(e: KeyboardEvent, down: boolean) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (down && !e.repeat) begin();
    if (!down) cancel();
  }
</script>

{#if result}
  {@const fell = result.to < result.from}
  <section class="reckoning done" class:fell aria-live="assertive">
    <p class="caps kicker">{fell ? 'The Beast takes its due' : `${table.nameOf(character.$id).split(' ')[0]} held`}</p>
    <blockquote>“{result.sin}”</blockquote>
    {#if fell}
      <PathDrop name={table.nameOf(character.$id)} path={result.path} from={result.from} to={result.to} />
    {:else}
    <div class="track" aria-label={`${result.path} ${result.to} of 10`}>
      {#each Array(10) as _, i (i)}
        <span class="dot" class:full={i < result.to} class:lost={fell && i === result.to}>
          {#if fell && i === result.to}<span class="shard"></span>{/if}
        </span>
      {/each}
      <span class="rating">
        {result.path}
        {#if fell}<s>{result.from}</s> <b>{result.to}</b>{:else}<b class="held">{result.from}</b>{/if}
      </span>
    </div>
    {/if}
    <p class="verdict">{fell ? `${result.path} falls to ${result.to}.` : `${result.path} holds at ${result.from}.`}</p>
    <button class="btn" onclick={() => (result = null)}>Close</button>
  </section>
{:else if laid}
  <section class="reckoning" aria-label="A sin laid before you">
    <p class="caps kicker">The Storyteller names a sin</p>
    <blockquote>“{laid.sin}”</blockquote>
    <p class="stakes">
      Roll {traitLabel(virtue)}, {dice} {dice === 1 ? 'die' : 'dice'}. Fail, and {character.path} falls to {Math.max(0, character.pathRating - 1)}.
    </p>
    <button
      class="hold"
      class:holding
      disabled={rolling}
      style={`--p: ${progress}`}
      onpointerdown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); begin(); }}
      onpointerup={cancel}
      onpointercancel={cancel}
      onlostpointercapture={cancel}
      onkeydown={(e) => key(e, true)}
      onkeyup={(e) => key(e, false)}
      onblur={cancel}
      oncontextmenu={(e) => e.preventDefault()}
    >
      <span class="fill" aria-hidden="true"></span>
      <span class="label">{rolling ? 'The dice fall…' : holding ? 'Hold…' : 'Press and hold to face it'}</span>
    </button>
    <p class="hint">Letting go early stops it. Space or Enter works too.</p>
  </section>
{/if}

<style>
  .reckoning {
    grid-column: 1 / -1;
    /* Ahead of everything, including the phone layout's reordered columns. */
    order: -2;
    background: var(--screen);
    color: var(--screen-ink);
    border: 1px solid var(--oxblood);
    padding: 22px clamp(16px, 3vw, 32px);
    display: grid;
    gap: 12px;
    justify-items: start;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
  }
  .kicker {
    margin: 0;
    color: var(--gold-soft);
    letter-spacing: 0.12em;
    font-size: 0.85rem;
  }
  blockquote {
    margin: 0;
    font-size: clamp(1.3rem, 2.4vw, 1.7rem);
    font-style: italic;
    line-height: 1.3;
    max-width: 60ch;
    overflow-wrap: anywhere;
  }
  .stakes {
    margin: 0;
    font-size: 1.05rem;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    font-style: italic;
    opacity: 0.75;
  }
  .hold {
    position: relative;
    overflow: hidden;
    min-width: min(320px, 100%);
    padding: 14px 22px;
    border: 1px solid var(--oxblood);
    background: transparent;
    color: var(--screen-ink);
    font-family: var(--caps);
    font-size: 1.05rem;
    letter-spacing: 0.06em;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .hold .fill {
    position: absolute;
    inset: 0;
    background: var(--oxblood);
    transform-origin: left;
    transform: scaleX(var(--p));
  }
  .hold .label {
    position: relative;
    color: var(--screen-ink);
    font-weight: 600;
  }
  .hold:focus-visible {
    outline: 2px solid var(--gold-soft);
    outline-offset: 2px;
  }
  .hold:disabled {
    cursor: progress;
  }

  .track {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0;
  }
  .dot {
    position: relative;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--screen-ink);
    opacity: 0.85;
  }
  .dot.full {
    background: var(--screen-ink);
  }
  /* The lost dot: glows red, cracks, and falls away, leaving its outline. */
  .dot.lost {
    border-color: var(--oxblood);
  }
  .shard {
    position: absolute;
    inset: -1.5px;
    border-radius: 50%;
    background: #c0182a;
    animation: lose 2.4s ease-in forwards;
  }
  .shard::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--screen);
    clip-path: polygon(48% 0, 58% 30%, 44% 52%, 60% 74%, 50% 100%, 46% 100%, 54% 74%, 38% 52%, 52% 30%, 42% 0);
    opacity: 0;
    animation: crack 2.4s forwards;
  }
  @keyframes lose {
    0% { box-shadow: 0 0 0 rgb(192 24 42 / 0); }
    25% { box-shadow: 0 0 18px 6px rgb(192 24 42 / 0.75); transform: none; opacity: 1; }
    55% { box-shadow: 0 0 10px 2px rgb(192 24 42 / 0.5); transform: none; opacity: 1; }
    100% { box-shadow: none; transform: translateY(70px) rotate(35deg); opacity: 0; }
  }
  @keyframes crack {
    0%, 35% { opacity: 0; }
    45%, 100% { opacity: 1; }
  }
  .rating {
    margin-left: 10px;
    font-size: 1.3rem;
  }
  .rating s {
    opacity: 0.6;
    text-decoration-color: #c0182a;
    text-decoration-thickness: 2px;
  }
  .rating b {
    color: #e04050;
    animation: arrive 0.6s 1.6s both;
  }
  .rating b.held {
    color: var(--screen-ink);
    animation: none;
  }
  @keyframes arrive {
    from { opacity: 0; transform: translateY(-6px); }
  }
  .verdict {
    margin: 0;
    font-size: 1.15rem;
  }
  .done .btn {
    background: transparent;
    color: var(--screen-ink);
    border-color: var(--screen-rule);
  }
  @media (prefers-reduced-motion: reduce) {
    .shard, .shard::after, .rating b { animation-duration: 0.01s; animation-delay: 0s; }
  }
</style>

<script lang="ts">
  import { HEALTH_LEVELS, trackBoxes, woundLevel, type DamageType, type HealthTrack } from '$engine/index.ts';

  let {
    track,
    compact = false,
    flash = false,
    onmark,
    onunmark,
  }: {
    track: HealthTrack;
    compact?: boolean;
    flash?: boolean;
    onmark?: (type: DamageType) => void;
    onunmark?: (type: DamageType) => void;
  } = $props();

  const MARK: Record<DamageType, string> = { bashing: '/', lethal: 'X', aggravated: '✱' };
  const boxes = $derived(trackBoxes(track));
  const current = $derived(woundLevel(track));
</script>

{#if compact}
  <div class="compact" class:flash role="img" aria-label={`Health: ${current ?? 'unhurt'}`}>
    {#each boxes as box, i (i)}<span class="box">{box ? MARK[box] : ''}</span>{/each}
  </div>
{:else}
  <ol class="track" class:flash aria-label="Health">
    {#each HEALTH_LEVELS as level, i (level.name)}
      <li class:current={level.name === current}>
        <span>{level.name}</span>
        <span class="pen">{i === 6 ? '' : level.penalty === 0 ? '' : `−${Math.abs(level.penalty)}`}</span>
        <span class="box" aria-label={boxes[i] ?? 'empty'}>{boxes[i] ? MARK[boxes[i]] : ''}</span>
      </li>
    {/each}
  </ol>
  {#if onmark}
    <div class="marks">
      <span class="label">Mark</span>
      {#each ['bashing', 'lethal', 'aggravated'] as const as type (type)}
        <button class="mark" onclick={() => onmark(type)} title={`Mark one ${type}`}>
          <span aria-hidden="true">{MARK[type]}</span> {type}
        </button>
      {/each}
    </div>
  {/if}
  {#if onunmark}
    <div class="marks">
      <span class="label">Correct</span>
      {#each ['bashing', 'lethal', 'aggravated'] as const as type (type)}
        <button class="mark quiet" disabled={track[type] === 0} onclick={() => onunmark(type)}>− {type}</button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .track {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: 1fr 2.2em 26px;
    align-items: center;
    padding: 2px 4px;
  }
  li.current {
    background: var(--blush);
  }
  .pen {
    color: var(--ink-soft);
    text-align: right;
    padding-right: 0.5em;
    font-variant-numeric: lining-nums;
  }
  .box {
    width: 22px;
    height: 22px;
    border: 1px solid var(--ink);
    display: inline-grid;
    place-items: center;
    font-size: 0.9rem;
    line-height: 1;
    color: var(--oxblood);
    font-weight: 600;
  }
  .compact {
    display: flex;
    gap: 4px;
  }
  .flash .box {
    animation: correct 0.9s ease;
  }
  @keyframes correct {
    30% {
      border-color: var(--gold);
      background: color-mix(in oklab, var(--gold) 25%, transparent);
    }
  }
  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-top: 10px;
  }
  .mark {
    border: 1px solid var(--rule);
    background: transparent;
    padding: 2px 8px;
    font-size: 0.9rem;
  }
  .mark:hover:not(:disabled) {
    border-color: var(--oxblood);
  }
  .mark span {
    color: var(--oxblood);
    font-weight: 600;
  }
  .mark.quiet {
    color: var(--ink-soft);
  }
</style>

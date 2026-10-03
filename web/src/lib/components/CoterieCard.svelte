<script lang="ts">
  import { bloodRules, woundLevel, woundPenalty } from '$engine/index.ts';
  import { healthOf, type Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import BloodPool from './BloodPool.svelte';
  import Dots from './Dots.svelte';
  import HealthTrack from './HealthTrack.svelte';
  import Portrait from './Portrait.svelte';
  import { ordinal } from './Sheet.svelte';

  let { table, character, onselect }: { table: TableState; character: Character; onselect: () => void } = $props();

  const track = $derived(healthOf(character));
  const penalty = $derived(woundPenalty(track));
  const spent = $derived(character.bloodPerTurn - table.remainingThisTurn(character));
  const low = $derived(character.bloodPool <= Math.max(1, Math.floor(character.bloodPoolMax * 0.15)));
</script>

<button class="card" class:low onclick={onselect}>
  <div class="top">
    <Portrait {table} fileId={(table.profiles[character.$id]?.portrait as string) ?? ''} name={table.nameOf(character.$id)} size="small" />
    <h3>{table.nameOf(character.$id)}{#if table.isDmpc(character)} <span class="dmpc caps" title="Played by the Storyteller">DMPC</span>{/if}</h3>
    <span class="caps">{character.template === 'dhampir' ? `Dhampir${character.clan ? ` · ${character.clan}` : ''}` : `${character.clan || 'Caitiff'} · ${ordinal(character.generation)}`}</span>
  </div>
  {#if character.title}<p class="office">{character.title}</p>{/if}
  <div class="line">
    <span class="label">Blood</span>
    <span><b>{character.bloodPool}</b> / {character.bloodPoolMax} · {spent} of {character.bloodPerTurn} this turn</span>
  </div>
  <BloodPool pool={character.bloodPool} max={character.bloodPoolMax} reserve={bloodRules(character).reserve} small />
  <div class="pair">
    <div>
      <span class="label">Willpower {character.willpowerTemporary} / {character.willpowerPermanent}</span>
      <Dots value={character.willpowerTemporary} max={character.willpowerPermanent} />
    </div>
    <div>
      <span class="label">{character.path} {character.pathRating} / 10</span>
      <Dots value={character.pathRating} max={10} />
    </div>
  </div>
  <div class="line">
    <HealthTrack {track} compact />
    <span class:pen={penalty > 0}>{penalty ? `${woundLevel(track)} −${penalty}` : 'No penalty'}</span>
  </div>
  {#if character.difficultySealed}<span class="sealed">Difficulty sealed</span>{/if}
</button>

<style>
  .office {
    margin: -4px 0 0;
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .card {
    text-align: left;
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 22px;
    display: grid;
    gap: 12px;
    align-content: start;
    transition: box-shadow 0.6s ease, background 0.6s ease;
  }
  .card:hover {
    border-color: var(--gold);
  }
  .card.low {
    border: 2px solid var(--oxblood);
    background: radial-gradient(ellipse at center, var(--paper), var(--blush));
  }
  .top,
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .top {
    align-items: center;
  }
  .top h3 {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-weight: 500;
    font-size: 1.55rem;
  }
  .caps {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  b {
    color: var(--oxblood);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .pair > div {
    display: grid;
    gap: 4px;
  }
  .pen {
    color: var(--oxblood);
  }
  .sealed {
    font-family: var(--caps);
    font-variant: small-caps;
    color: var(--oxblood);
    font-size: 0.85rem;
  }
  .dmpc {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--oxblood);
    border: 1px solid currentColor;
    padding: 0 5px;
    vertical-align: middle;
  }
</style>

<script lang="ts">
  /**
   * The Storyteller's cast, behind the screen. Each NPC carries a stat block,
   * wounds, blood and Willpower; rolls are built from its traits on the server
   * and stay hidden unless the Storyteller shows them. NPCs ticked "in the
   * fight" roll into initiative with the coterie.
   */
  import { ABILITIES, ATTRIBUTES, applyDamage, traitLabel, woundLevel, woundPenalty, type DamageType } from '$engine/index.ts';
  import { parseJson } from '$shared/codec.ts';
  import type { AnyRow } from '$lib/appwrite';
  import type { TableState } from '$lib/table.svelte';
  import { disciplineLevels } from '$lib/library';
  import HealthTrack from './HealthTrack.svelte';

  let { table, fighting = $bindable([]) }: { table: TableState; fighting?: string[] } = $props();

  const KINDS = ['vampire', 'ghoul', 'mortal', 'other'] as const;
  const ATTR_KEYS = Object.values(ATTRIBUTES).flat() as string[];
  const ABIL_KEYS = Object.values(ABILITIES).flat() as string[];

  type Npc = {
    $id: string; name: string; kind: string; clan: string; generation: number | null;
    attributes: Record<string, number>; abilities: Record<string, number>; disciplines: { name: string; level: number }[];
    willpower: number; willpowerMax: number; bloodPool: number; bloodPoolMax: number;
    healthBashing: number; healthLethal: number; healthAggravated: number; notes: string;
  };
  const decode = (r: AnyRow): Npc => ({
    ...(r as any),
    attributes: parseJson(r.attributes, {}),
    abilities: parseJson(r.abilities, {}),
    disciplines: parseJson(r.disciplines, []),
    notes: r.notes ?? '',
    clan: r.clan ?? '',
  });
  const npcs = $derived(Object.values(table.npcs).map(decode).sort((a, b) => a.name.localeCompare(b.name)));
  const track = (n: Npc) => ({ bashing: n.healthBashing, lethal: n.healthLethal, aggravated: n.healthAggravated });

  let newName = $state('');
  let newKind = $state<(typeof KINDS)[number]>('vampire');
  let open = $state<string | null>(null);
  let draft = $state<Npc | null>(null);
  let addAbility = $state('');
  let confirmDelete = $state<string | null>(null);
  let roll = $state({ a: 'dexterity', b: '', difficulty: 6, shown: false, willpower: false });
  let lastRoll = $state<Record<string, string>>({});

  async function create() {
    if (!newName.trim()) return;
    const out = await table.act<{ npcId: string }>('chronicle', {
      action: 'saveNpc', chronicleId: table.chronicleId,
      npc: { name: newName.trim(), kind: newKind, ...(newKind === 'vampire' ? { generation: 12, bloodPoolMax: 11, bloodPool: 8 } : { bloodPoolMax: newKind === 'ghoul' ? 3 : 0 }) },
    });
    if (out) {
      newName = '';
      expand(out.npcId);
    }
  }

  function expand(id: string) {
    if (open === id) {
      open = null;
      draft = null;
      return;
    }
    open = id;
    const row = table.npcs[id];
    draft = row ? structuredClone($state.snapshot(decode(row))) : null;
  }

  const patch = (n: Npc, data: Record<string, unknown>) =>
    table.act('chronicle', { action: 'saveNpc', chronicleId: table.chronicleId, npcId: n.$id, npc: data });

  function damage(n: Npc, amount: number, type: DamageType) {
    const next = applyDamage(track(n), amount, type).track;
    void patch(n, { healthBashing: next.bashing, healthLethal: next.lethal, healthAggravated: next.aggravated });
  }
  const bump = (n: Npc, key: 'bloodPool' | 'willpower', by: number, max: number) =>
    void patch(n, { [key]: Math.max(0, Math.min(max, n[key] + by)) });

  async function saveDraft() {
    if (!draft) return;
    const d = draft;
    const ok = await patch(d, {
      name: d.name, kind: d.kind, clan: d.clan, generation: d.kind === 'vampire' ? d.generation : null,
      attributes: d.attributes, abilities: d.abilities,
      disciplines: d.disciplines.filter((x) => x.name.trim()),
      willpowerMax: d.willpowerMax, willpower: Math.min(d.willpower, d.willpowerMax),
      bloodPoolMax: d.bloodPoolMax, bloodPool: Math.min(d.bloodPool, d.bloodPoolMax),
      notes: d.notes,
    });
    if (ok) {
      open = null;
      draft = null;
    }
  }

  async function rollFor(n: Npc) {
    const out = await table.act<any>('rollPool', {
      npcId: n.$id,
      traits: [roll.a, roll.b].filter(Boolean),
      difficulty: roll.difficulty,
      visibility: roll.shown ? 'table' : 'storyteller',
      spendWillpower: roll.willpower,
    });
    if (out) {
      lastRoll[n.$id] = out.refusal
        ? out.refusal
        : `${out.label}: ${out.outcome === 'botch' ? 'botch' : `${out.netSuccesses} success${out.netSuccesses === 1 ? '' : 'es'}`} (${(out.dice ?? []).map((d: any) => d.value ?? d).join(' ')})`;
      roll.willpower = false;
    }
  }

  async function remove(n: Npc) {
    const ok = await table.act('chronicle', { action: 'removeNpc', chronicleId: table.chronicleId, npcId: n.$id });
    if (ok) {
      fighting = fighting.filter((id) => id !== n.$id);
      confirmDelete = null;
      open = null;
    }
  }

  const toggleFight = (id: string) => (fighting = fighting.includes(id) ? fighting.filter((x) => x !== id) : [...fighting, id]);
  const trained = (n: Npc) => ABIL_KEYS.filter((k) => (n.abilities[k] ?? 0) > 0);
</script>

<section class="panel npcs" aria-label="NPCs">
  <header>
    <h2>NPCs</h2>
    <form class="new" onsubmit={(e) => { e.preventDefault(); void create(); }}>
      <input bind:value={newName} placeholder="Sheriff Aldana" aria-label="New NPC name" maxlength="120" />
      <select bind:value={newKind} aria-label="Kind">{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}</select>
      <button class="btn quiet" disabled={!newName.trim()}>Add NPC</button>
    </form>
  </header>

  {#each npcs as n (n.$id)}
    {@const t = track(n)}
    <article class="npc" class:open={open === n.$id}>
      <div class="top">
        <button class="name plain" onclick={() => expand(n.$id)} aria-expanded={open === n.$id}>
          <b>{n.name}</b>
          <span class="caps meta">{[n.kind, n.clan, n.generation ? `${n.generation}th gen` : ''].filter(Boolean).join(' · ')}</span>
        </button>
        <label class="fight"><input type="checkbox" checked={fighting.includes(n.$id)} onchange={() => toggleFight(n.$id)} /> in the fight</label>
      </div>
      <div class="state">
        <HealthTrack track={t} compact onmark={(type) => damage(n, 1, type)} onunmark={(type) => damage(n, -1, type)} />
        <span class:pen={woundPenalty(t) > 0}>{woundPenalty(t) ? `${woundLevel(t)} −${woundPenalty(t)}` : 'Unhurt'}</span>
        {#if n.bloodPoolMax > 0}
          <span class="pool">Blood <button class="tiny" onclick={() => bump(n, 'bloodPool', -1, n.bloodPoolMax)} aria-label="Spend blood">−</button> {n.bloodPool}/{n.bloodPoolMax} <button class="tiny" onclick={() => bump(n, 'bloodPool', 1, n.bloodPoolMax)} aria-label="Add blood">+</button></span>
        {/if}
        <span class="pool">WP <button class="tiny" onclick={() => bump(n, 'willpower', -1, n.willpowerMax)} aria-label="Spend Willpower">−</button> {n.willpower}/{n.willpowerMax} <button class="tiny" onclick={() => bump(n, 'willpower', 1, n.willpowerMax)} aria-label="Restore Willpower">+</button></span>
      </div>
      <p class="stats">
        {ATTR_KEYS.map((k) => `${traitLabel(k).slice(0, 3)} ${n.attributes[k] ?? 2}`).join(' · ')}
        {#if trained(n).length}<br />{trained(n).map((k) => `${traitLabel(k)} ${n.abilities[k]}`).join(', ')}{/if}
        {#if n.disciplines.length}<br /><i>{n.disciplines.map((d) => `${d.name} ${d.level}`).join(', ')}</i>{/if}
      </p>

      {#if open === n.$id && draft}
        <div class="roll">
          <select bind:value={roll.a} aria-label="First trait">{#each [...ATTR_KEYS, ...ABIL_KEYS] as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}</select>
          <select bind:value={roll.b} aria-label="Second trait"><option value="">—</option>{#each [...ABIL_KEYS, ...ATTR_KEYS] as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}</select>
          <label>Diff <input type="number" min="2" max="10" bind:value={roll.difficulty} /></label>
          <label><input type="checkbox" bind:checked={roll.willpower} /> WP</label>
          <label><input type="checkbox" bind:checked={roll.shown} /> show table</label>
          <button class="btn solid" onclick={() => rollFor(n)}>Roll</button>
        </div>
        {#if lastRoll[n.$id]}<p class="result">{lastRoll[n.$id]}</p>{/if}

        {@const levels = disciplineLevels(table.library, n.disciplines)}
        {#if levels.some((d) => d.powers.length)}
          <ul class="powers">
            {#each levels as d (d.name)}
              {#each d.powers as p (p.entry.$id)}<li title={p.text}><b>{p.entry.name}</b> <span class="meta">{d.name} {p.needs[0][0].level}</span></li>{/each}
            {/each}
          </ul>
        {/if}

        <div class="edit">
          <div class="grid">
            <label>Name <input bind:value={draft.name} maxlength="120" /></label>
            <label>Kind <select bind:value={draft.kind}>{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}</select></label>
            <label>Clan <input bind:value={draft.clan} maxlength="60" /></label>
            {#if draft.kind === 'vampire'}<label>Generation <input type="number" min="3" max="15" bind:value={draft.generation} /></label>{/if}
            <label>Willpower max <input type="number" min="1" max="10" bind:value={draft.willpowerMax} /></label>
            <label>Blood max <input type="number" min="0" max="50" bind:value={draft.bloodPoolMax} /></label>
          </div>
          <div class="attrs">
            {#each ATTR_KEYS as k (k)}
              <label>{traitLabel(k)} <input type="number" min="1" max="5" bind:value={draft.attributes[k]} /></label>
            {/each}
          </div>
          <div class="attrs">
            {#each ABIL_KEYS.filter((k) => (draft?.abilities[k] ?? 0) > 0) as k (k)}
              <label>{traitLabel(k)} <input type="number" min="0" max="5" bind:value={draft.abilities[k]} /></label>
            {/each}
            <label>Add ability
              <select bind:value={addAbility} onchange={() => { if (draft && addAbility) { draft.abilities[addAbility] = 1; addAbility = ''; } }}>
                <option value="">—</option>
                {#each ABIL_KEYS.filter((k) => !(draft?.abilities[k] ?? 0)) as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}
              </select>
            </label>
          </div>
          <div class="discs">
            {#each draft.disciplines as d, i (i)}
              <span class="disc"><input bind:value={d.name} placeholder="Dominate" list="npc-disciplines" aria-label="Discipline" /><input type="number" min="1" max="10" bind:value={d.level} aria-label="Level" /><button class="tiny" onclick={() => draft?.disciplines.splice(i, 1)} aria-label="Remove">×</button></span>
            {/each}
            <button class="btn quiet" onclick={() => draft?.disciplines.push({ name: '', level: 1 })}>Add Discipline</button>
          </div>
          <label class="notes">Notes <textarea bind:value={draft.notes} rows="3" maxlength="4000"></textarea></label>
          <div class="actions">
            <button class="btn solid" onclick={saveDraft}>Save stats</button>
            <button class="btn quiet" onclick={() => expand(n.$id)}>Close</button>
            {#if confirmDelete === n.$id}
              <button class="btn danger" onclick={() => remove(n)}>Delete {n.name} for good</button>
            {:else}
              <button class="btn quiet" onclick={() => (confirmDelete = n.$id)}>Delete…</button>
            {/if}
          </div>
        </div>
      {/if}
    </article>
  {:else}
    <p class="quiet">No NPCs yet. Add the Prince, the Sheriff, the ghoul at the door.</p>
  {/each}
  <datalist id="npc-disciplines">{#each Object.values(table.library).filter((e) => e.kind === 'discipline') as e (e.$id)}<option value={e.name}></option>{/each}</datalist>
</section>

<style>
  .npcs {
    display: grid;
    gap: 14px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-weight: 500;
  }
  .new {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .npc {
    border-top: 1px solid var(--rule);
    padding-top: 10px;
    display: grid;
    gap: 6px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .plain {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .name b {
    font-size: 1.2rem;
    font-weight: 500;
  }
  .meta {
    color: var(--ink-faint);
    font-size: 0.85rem;
  }
  .fight {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .state {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    align-items: center;
    font-size: 0.95rem;
  }
  .pen {
    color: var(--oxblood);
  }
  .pool {
    white-space: nowrap;
  }
  .tiny {
    background: none;
    border: 1px solid var(--rule);
    color: inherit;
    padding: 0 6px;
    cursor: pointer;
    font: inherit;
    line-height: 1.3;
  }
  .stats {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .roll {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px;
    background: var(--cream);
  }
  .roll input[type='number'] {
    width: 3.5em;
  }
  .result {
    margin: 0;
    font-style: italic;
  }
  .powers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 0.9rem;
  }
  .edit {
    display: grid;
    gap: 10px;
  }
  .grid,
  .attrs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px 14px;
  }
  .grid label,
  .attrs label,
  .notes {
    display: grid;
    gap: 2px;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .attrs input {
    width: 4em;
  }
  .discs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .disc {
    display: inline-flex;
    gap: 4px;
  }
  .disc input[type='number'] {
    width: 3.5em;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .danger {
    color: var(--oxblood);
  }
  .quiet {
    color: var(--ink-faint);
    font-style: italic;
  }
</style>

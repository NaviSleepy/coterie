<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { ABILITIES, ATTRIBUTES, bloodPerTurn, bloodPoolMax, creationCost, rulesFor, traitLabel, type CreationOverrides } from '$engine/index.ts';
  import { parseJson } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { dotMeaning, entriesOf, findEntry, gloss, parseRitual, sectNames } from '$lib/library';

  const table = getContext<TableState>('table');

  let profile = $state({ name: '', concept: '', nature: '', demeanor: '' });
  let template = $state<'vampire' | 'dhampir'>('vampire');
  let dhampirConcept = $state('');
  let clan = $state('');
  let sect = $state('Camarilla');
  let sire = $state('');
  let generation = $state(13);
  let attributes = $state<Record<string, number>>(Object.fromEntries(Object.values(ATTRIBUTES).flat().map((k) => [k, 1])));
  let abilities = $state<Record<string, number>>(Object.fromEntries(Object.values(ABILITIES).flat().map((k) => [k, 0])));
  let virtues = $state<Record<string, number>>({ conscience: 1, selfControl: 1, courage: 1 });
  let path = $state('');
  /** Humanity (or a Path) and Willpower start where the Virtues put them; these are the dots bought on top. */
  let pathExtra = $state(0);
  let willpowerExtra = $state(0);
  let disciplines = $state<{ name: string; level: number }[]>([]);
  let backgrounds = $state<{ name: string; level: number }[]>([]);
  let specialties = $state<{ trait: string; text: string }[]>([]);
  let merits = $state<{ name: string; points: number }[]>([]);
  let rituals = $state<{ name: string; level: number }[]>([]);
  let flaws = $state<{ name: string; points: number }[]>([]);
  let busy = $state(false);

  /** Picking a merit or flaw from the table's library brings its cost with it. */
  function priced(row: { name: string; points: number }, kind: 'merit' | 'flaw') {
    const e = findEntry(table.library, kind, row.name);
    if (e?.points) row.points = e.points;
  }

  const total = (list: { name: string; points: number }[]) =>
    list.filter((m) => m.name.trim()).reduce((sum, m) => sum + m.points, 0);
  const meritPoints = $derived(total(merits));
  const flawPoints = $derived(total(flaws));

  const basePath = $derived((virtues.conscience ?? virtues.conviction ?? 1) + (virtues.selfControl ?? virtues.instinct ?? 1));
  const pathRating = $derived(Math.min(10, basePath + pathExtra));
  const willpowerPermanent = $derived(Math.min(10, (virtues.courage ?? 1) + willpowerExtra));

  /** This campaign's changes to the book's budget, set by the Storyteller. */
  const overrides = $derived(parseJson<CreationOverrides>(table.chronicle?.creationRules, {}));
  const custom = $derived(Object.keys(overrides[template] ?? {}).length > 0);
  /** The same budget the server holds a player to. */
  const cost = $derived(
    creationCost({ template, generation, attributes, abilities, disciplines, backgrounds, virtues, pathRating, willpowerPermanent, merits, flaws }, overrides),
  );
  const rules = $derived(rulesFor(template, overrides));
  const needsApproval = $derived(!table.isStoryteller && !cost.ok);
  let sent = $state(false);

  const eligible = $derived(
    [...Object.entries(attributes), ...Object.entries(abilities)].filter(([, v]) => v >= 4).map(([k]) => k),
  );

  async function submit() {
    busy = true;
    const out = await table.act('character', {
      action: needsApproval ? 'requestCreation' : 'create',
      chronicleId: table.chronicleId,
      profile,
      sheet: {
        template, ...(template === 'dhampir' ? { dhampirConcept } : {}), clan, sect, sire, generation, attributes, abilities, virtues, path: path.trim() || 'Humanity', pathRating, willpowerPermanent,
        disciplines: disciplines.filter((d) => d.name.trim()),
        backgrounds: backgrounds.filter((b) => b.name.trim()),
        merits: merits.filter((m) => m.name.trim()),
        rituals: rituals.filter((r) => r.name.trim()),
        flaws: flaws.filter((f) => f.name.trim()),
        specialties: specialties.filter((s) => eligible.includes(s.trait)),
      },
    });
    busy = false;
    if (out && needsApproval) sent = true;
    else if (out) await goto(table.isStoryteller ? `${table.home}/screen` : table.home);
  }

  /** Paths of Enlightenment trade Conscience for Conviction and Self-Control for Instinct; the dots carry over. */
  function swapVirtue(human: string, alt: string) {
    const [from, to] = alt in virtues ? [alt, human] : [human, alt];
    virtues = Object.fromEntries(Object.entries(virtues).map(([k, v]) => [k === from ? to : k, v]));
  }

  function clampSet(map: Record<string, number>, key: string, v: number, min: number) {
    map[key] = Math.max(min, Math.min(5, v));
  }
</script>

<main class="panel">
  {#each ['clan', 'merit', 'flaw', 'discipline', 'background', 'path', 'archetype', 'concept', 'ritual'] as const as kind (kind)}
    <datalist id={`lib-${kind}`}>{#each entriesOf(table.library, kind) as e (e.$id)}<option value={e.name}></option>{/each}</datalist>
  {/each}
  {#if table.isStoryteller}
    <h1>Create a DMPC</h1>
    <p class="hint">A character you play yourself alongside the coterie. It sits on the screen with everyone else's, marked DMPC, and you play it from "My sheet". Players can't open its sheet, just as they can't open each other's, and its rolls show in the feed like anyone's.</p>
  {:else}
    <h1>Bring a character to the table</h1>
    <p class="hint">Mechanical traits are checked by the server when you submit. The Storyteller can adjust them later; you can always edit your name, concept, Nature and Demeanor yourself.</p>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
    <fieldset class="grid">
      <label>Name <input required bind:value={profile.name} /></label>
      <label>Concept <input bind:value={profile.concept} /></label>
      <label>Nature <input bind:value={profile.nature} list="lib-archetype" />{#if gloss(findEntry(table.library, 'archetype', profile.nature))}<span class="hint">{gloss(findEntry(table.library, 'archetype', profile.nature))}</span>{/if}</label>
      <label>Demeanor <input bind:value={profile.demeanor} list="lib-archetype" />{#if gloss(findEntry(table.library, 'archetype', profile.demeanor))}<span class="hint">{gloss(findEntry(table.library, 'archetype', profile.demeanor))}</span>{/if}</label>
      <label>Template
        <select bind:value={template}><option value="vampire">Vampire</option><option value="dhampir">Dhampir</option></select>
        {#if template === 'dhampir'}<span class="hint">Half-vampire: blood pool 10, one blood a turn, starts full. Disciplines stop at one dot; Bloodrights go up to three.</span>{/if}
      </label>
      {#if template === 'dhampir'}
        <label>Dhampir concept <input bind:value={dhampirConcept} list="lib-concept" placeholder="Renegade" />{#if gloss(findEntry(table.library, 'concept', dhampirConcept))}<span class="hint">{gloss(findEntry(table.library, 'concept', dhampirConcept))}</span>{/if}</label>
      {/if}
      <label>{template === 'dhampir' ? "Antecedent's clan" : 'Clan'} <input bind:value={clan} list="lib-clan" />{#if gloss(findEntry(table.library, 'clan', clan))}<span class="hint">{gloss(findEntry(table.library, 'clan', clan))}</span>{/if}</label>
      <label>Sect <input bind:value={sect} list="lib-sect" />{#if gloss(findEntry(table.library, 'sect', sect))}<span class="hint">{gloss(findEntry(table.library, 'sect', sect))}</span>{/if}</label>
      <datalist id="lib-sect">{#each sectNames(table.library) as s (s)}<option value={s}></option>{/each}</datalist>
      <label>Sire <input bind:value={sire} /></label>
      {#if template === 'vampire'}
        <label>Generation
          <select bind:value={generation}>
            {#each [13, 12, 11, 10, 9, 8, 7, 6, 5, 4] as g (g)}<option value={g}>{g}th — pool {bloodPoolMax(g)}, {bloodPerTurn(g)}/turn</option>{/each}
          </select>
        </label>
      {/if}
    </fieldset>

    <h2>Attributes</h2>
    <div class="cols">
      {#each Object.entries(ATTRIBUTES) as [group, keys] (group)}
        <div>
          <h3 class="label">{group}</h3>
          {#each keys as k (k)}
            <label class="trait">{traitLabel(k)}
              <input type="number" min="1" max="5" value={attributes[k]} oninput={(e) => clampSet(attributes, k, +e.currentTarget.value, 1)} />
            </label>
            {#if dotMeaning(table.library, k, attributes[k])}<p class="hint dot">{dotMeaning(table.library, k, attributes[k])}</p>{/if}
          {/each}
        </div>
      {/each}
    </div>

    <h2>Abilities</h2>
    <div class="cols">
      {#each Object.entries(ABILITIES) as [group, keys] (group)}
        <div>
          <h3 class="label">{group}</h3>
          {#each keys as k (k)}
            <label class="trait">{traitLabel(k)}
              <input type="number" min="0" max="5" value={abilities[k]} oninput={(e) => clampSet(abilities, k, +e.currentTarget.value, 0)} />
            </label>
            {#if dotMeaning(table.library, k, abilities[k])}<p class="hint dot">{dotMeaning(table.library, k, abilities[k])}</p>{/if}
          {/each}
        </div>
      {/each}
    </div>

    <h2>Specialties <span class="hint">— only for traits at four dots or more</span></h2>
    {#each specialties as s, i (i)}
      <div class="row">
        <select bind:value={s.trait}>{#each eligible as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}</select>
        <input bind:value={s.text} placeholder="Violin" />
        <button type="button" class="btn quiet" onclick={() => (specialties = specialties.filter((_, j) => j !== i))}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn quiet" disabled={eligible.length === 0} onclick={() => (specialties = [...specialties, { trait: eligible[0], text: '' }])}>Add specialty</button>

    <h2>Disciplines</h2>
    {#each disciplines as d, i (i)}
      <div class="row">
        <input bind:value={d.name} placeholder="Auspex" list="lib-discipline" />
        <input type="number" min="1" max="5" bind:value={d.level} />
        <button type="button" class="btn quiet" onclick={() => (disciplines = disciplines.filter((_, j) => j !== i))}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn quiet" onclick={() => (disciplines = [...disciplines, { name: '', level: 1 }])}>Add Discipline</button>

    <h2>Backgrounds <span class="hint">— {rules.backgrounds} dots{#if rules.generationCosts}; Generation below 13th counts here whether you list it or not{/if}</span></h2>
    {#each backgrounds as b, i (i)}
      <div class="row">
        <input bind:value={b.name} placeholder="Resources" aria-label="Background name" list="lib-background" />
        <input type="number" min="1" max="5" bind:value={b.level} aria-label="Background dots" />
        <button type="button" class="btn quiet" onclick={() => (backgrounds = backgrounds.filter((_, j) => j !== i))}>Remove</button>
      </div>
      {#if gloss(findEntry(table.library, 'background', b.name))}<p class="hint ref">{gloss(findEntry(table.library, 'background', b.name))}</p>{/if}
    {/each}
    <button type="button" class="btn quiet" onclick={() => (backgrounds = [...backgrounds, { name: '', level: 1 }])}>Add Background</button>

    <h2>Rituals <span class="hint">— thaumaturges and necromancers usually start with one</span></h2>
    {#each rituals as r, i (i)}
      <div class="row">
        <input bind:value={r.name} placeholder="Blood Rush" aria-label="Ritual name" list="lib-ritual"
          oninput={() => { const e = findEntry(table.library, 'ritual', r.name); if (e) r.level = parseRitual(e)?.level ?? 0; }} />
        <input type="number" min="0" max="10" bind:value={r.level} aria-label="Ritual level" />
        <button type="button" class="btn quiet" onclick={() => (rituals = rituals.filter((_, j) => j !== i))}>Remove</button>
      </div>
      {#if gloss(findEntry(table.library, 'ritual', r.name))}<p class="hint ref">{gloss(findEntry(table.library, 'ritual', r.name))}</p>{/if}
    {/each}
    <button type="button" class="btn quiet" onclick={() => (rituals = [...rituals, { name: '', level: 1 }])}>Add ritual</button>

    <h2>Merits and Flaws <span class="hint">— merits cost 1–7 freebie points, flaws give back 1–7</span></h2>
    <div class="cols two">
      <div>
        <h3 class="label">Merits</h3>
        {#each merits as m, i (i)}
          <div class="row">
            <input bind:value={m.name} placeholder="Eidetic Memory" aria-label="Merit name" list="lib-merit" oninput={() => priced(m, 'merit')} />
            <input type="number" min="1" max="7" bind:value={m.points} aria-label="Merit points" />
            <button type="button" class="btn quiet" onclick={() => (merits = merits.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {#if gloss(findEntry(table.library, 'merit', m.name))}<p class="hint ref">{gloss(findEntry(table.library, 'merit', m.name))}</p>{/if}
        {/each}
        <button type="button" class="btn quiet" onclick={() => (merits = [...merits, { name: '', points: 1 }])}>Add merit</button>
      </div>
      <div>
        <h3 class="label">Flaws</h3>
        {#each flaws as f, i (i)}
          <div class="row">
            <input bind:value={f.name} placeholder="Nightmares" aria-label="Flaw name" list="lib-flaw" oninput={() => priced(f, 'flaw')} />
            <input type="number" min="1" max="7" bind:value={f.points} aria-label="Flaw points" />
            <button type="button" class="btn quiet" onclick={() => (flaws = flaws.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {#if gloss(findEntry(table.library, 'flaw', f.name))}<p class="hint ref">{gloss(findEntry(table.library, 'flaw', f.name))}</p>{/if}
        {/each}
        <button type="button" class="btn quiet" onclick={() => (flaws = [...flaws, { name: '', points: 1 }])}>Add flaw</button>
      </div>
    </div>
    {#if meritPoints || flawPoints}
      <p class="hint">Merits {meritPoints} · Flaws {flawPoints} · net {meritPoints - flawPoints} freebie points{#if flawPoints > 7}. V20 allows at most 7 points of flaws; the Storyteller decides.{/if}</p>
    {/if}

    <h2>Virtues, Path, Willpower</h2>
    <div class="grid">
      {#each Object.keys(virtues) as k (k)}
        <label>{traitLabel(k)} <input type="number" min="1" max="5" bind:value={virtues[k]} /></label>
      {/each}
      <label>Path <input bind:value={path} list="lib-path" placeholder="Humanity" />{#if gloss(findEntry(table.library, 'path', path))}<span class="hint">{gloss(findEntry(table.library, 'path', path))}</span>{/if}</label>
      <label>{path.trim() || 'Humanity'} <b class="derived">{pathRating}</b><span class="hint">{basePath} from the Virtues, plus <input class="small" type="number" min="0" max={10 - basePath} bind:value={pathExtra} aria-label="Extra Humanity or Path dots" /> bought</span></label>
      <label>Willpower <b class="derived">{willpowerPermanent}</b><span class="hint">{virtues.courage ?? 1} from Courage, plus <input class="small" type="number" min="0" max={10 - (virtues.courage ?? 1)} bind:value={willpowerExtra} aria-label="Extra Willpower dots" /> bought</span></label>
    </div>
    <div class="row swaps">
      <button type="button" class="btn quiet" onclick={() => swapVirtue('conscience', 'conviction')}>{'conviction' in virtues ? 'Back to Conscience' : 'Conviction instead of Conscience'}</button>
      <button type="button" class="btn quiet" onclick={() => swapVirtue('selfControl', 'instinct')}>{'instinct' in virtues ? 'Back to Self-Control' : 'Instinct instead of Self-Control'}</button>
    </div>

    {#if sent}
      <p class="sent">Sent. The Storyteller will look it over; you'll find it on your page, and the character takes its seat when they approve it. <a href={table.home}>Back to the table</a></p>
    {:else}
      {#if needsApproval}<p class="hint">This goes over the creation budget{cost.problems.length ? ' or breaks a creation rule' : ''}, so it needs the Storyteller's approval. You can trim it, or send it as it is.</p>{/if}
      <button class="btn solid submit" disabled={busy || !profile.name.trim()}>{busy ? (needsApproval ? 'Sending…' : template === 'dhampir' ? 'Taking a seat…' : 'Rolling starting blood…') : table.isStoryteller ? 'Create DMPC' : needsApproval ? 'Send to the Storyteller for approval' : 'Take a seat'}</button>
    {/if}
    {#if table.error}<p class="error">{table.error}</p>{/if}
  </form>

  <aside class="budget" class:over={!cost.ok} aria-label="Creation budget">
    <h2>Budget</h2>
    <p class="hint">{custom ? "This campaign's own numbers, set by the Storyteller." : 'V20 as written.'}{#if table.isStoryteller} A DMPC isn't held to it; it's here as a guide.{/if}</p>
    {#each cost.lines as l (l.key)}
      {#if l.budget || l.spent}
        <div class="line" class:spending={l.freebies > 0}>
          <span>{l.label}</span>
          <span>{#if l.budget}{l.spent} / {l.budget}{:else}+{l.spent}{/if}{#if l.freebies}{' · '}{l.freebies} fp{/if}</span>
        </div>
        {#if l.groups}
          <p class="groups">{l.groups.map((g) => `${g.name} ${g.spent}/${g.budget}`).join(' · ')}</p>
        {/if}
      {/if}
    {/each}
    <div class="line total">
      <span>Freebies</span>
      <span>{cost.freebiesSpent} / {cost.freebieBudget}</span>
    </div>
    {#if cost.flawRefund}<p class="groups">{rules.freebies} + {cost.flawRefund} from flaws</p>{/if}
    <p class="left">{cost.overBy ? `${cost.overBy} over` : `${cost.freebiesLeft} left`}</p>
    {#each cost.problems as p (p)}<p class="problem">{p}</p>{/each}
    <p class="hint">Priorities pick themselves: the biggest pool goes where you spent the most.</p>
  </aside>
</main>

<style>
  main {
    max-width: 1180px;
    margin: 32px auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 0 32px;
    align-items: start;
  }
  main > :global(:not(form):not(aside)) {
    grid-column: 1 / -1;
  }
  .budget {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 4px;
    border: 1px solid var(--rule);
    padding: 14px 16px;
    font-size: 0.95rem;
  }
  .budget h2 {
    margin: 0 0 4px;
  }
  .budget .line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .budget .spending span:last-child {
    color: var(--oxblood);
  }
  .budget .groups {
    text-transform: capitalize;
    margin: 0 0 4px;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .budget .total {
    border-top: 1px solid var(--rule);
    padding-top: 6px;
    margin-top: 4px;
    font-weight: 600;
  }
  .budget .left {
    margin: 0;
    font-size: 1.3rem;
  }
  .budget.over .left,
  .budget .problem {
    color: var(--oxblood);
  }
  .budget .problem {
    margin: 0;
    font-size: 0.85rem;
  }
  .derived {
    font-size: 1.2rem;
    color: var(--ink);
  }
  input.small {
    width: 3.5em;
  }
  .sent {
    margin-top: 24px;
    font-size: 1.05rem;
  }
  @media (max-width: 860px) {
    main {
      grid-template-columns: 1fr;
    }
    main > :global(h1),
    main > :global(p.hint) {
      order: -2;
    }
    .budget {
      position: static;
      order: -1;
      margin-bottom: 16px;
    }
  }
  h1 {
    font-weight: 500;
    margin: 0 0 8px;
  }
  h2 {
    font-weight: 500;
    margin: 28px 0 10px;
  }
  h3 {
    margin: 0 0 6px;
  }
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.95rem;
  }
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px 20px;
  }
  .grid label {
    display: grid;
    gap: 4px;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  .cols.two {
    grid-template-columns: repeat(2, 1fr);
  }
  .trait {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .trait input {
    width: 3.5em;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .dot {
    margin: -2px 0 6px;
    font-size: 0.85rem;
  }
  .ref {
    margin: -4px 0 8px;
  }
  .swaps {
    margin-top: 12px;
  }
  .submit {
    margin-top: 32px;
  }
  @media (max-width: 700px) {
    .cols,
    .cols.two {
      grid-template-columns: 1fr;
    }
  }
</style>

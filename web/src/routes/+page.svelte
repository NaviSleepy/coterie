<script lang="ts">
  import { goto } from '$app/navigation';
  import { call, CallError, listRows, Query, teams } from '$lib/appwrite';
  import { session } from '$lib/session.svelte';
  import type { AnyRow } from '$lib/appwrite';

  let email = $state('');
  let sent = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  let chronicles = $state<AnyRow[]>([]);
  let name = $state(session.user?.name ?? '');
  let newName = $state('');
  let botchRule = $state('zero-with-a-one-is-a-botch');
  let code = $state('');

  async function load() {
    const { teams: mine } = await teams.list({});
    if (mine.length === 0) {
      chronicles = [];
      return;
    }
    chronicles = await listRows('chronicles', [Query.equal('teamId', mine.map((t) => t.$id)), Query.limit(50)]);
  }

  $effect(() => {
    if (session.user) void load();
  });

  async function guard(fn: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await fn();
    } catch (e) {
      error = e instanceof CallError ? e.message : (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const sendLink = () => guard(async () => {
    await session.sendLink(email);
    sent = true;
  });

  const create = () => guard(async () => {
    const c = await call('chronicle', { action: 'create', name: newName, botchRule });
    await goto(`/c/${c.$id}/screen`);
  });

  const join = () => guard(async () => {
    const c = await call('chronicle', { action: 'join', inviteCode: code });
    await goto(`/c/${c.$id}`);
  });

  const saveName = () => guard(() => session.rename(name));
</script>

<main>
  <h1 class="mark">Coterie</h1>

  {#if !session.user}
    <p class="lede">A table for Vampire: The Masquerade, 20th Anniversary Edition. The dice are rolled behind glass; the secrets stay sealed.</p>
    {#if sent}
      <p class="sent">A link is on its way to <b>{email}</b>. Open it on this device to take your seat.</p>
    {:else}
      <form class="panel door" onsubmit={(e) => { e.preventDefault(); void sendLink(); }}>
        <label for="email" class="label">Your email</label>
        <input id="email" type="email" required autocomplete="email" bind:value={email} />
        <button class="btn solid" disabled={busy}>Send me a link</button>
      </form>
    {/if}
    <p class="quiet">Or <a href="/demo">sit at a demo table</a> — no account, nothing saved.</p>
  {:else}
    <section class="panel">
      <div class="who">
        <label class="label" for="name">You are known as</label>
        <div class="row">
          <input id="name" bind:value={name} placeholder="Your name at the table" />
          <button class="btn quiet" onclick={saveName} disabled={busy || !name.trim() || name === session.user.name}>Save</button>
          <button class="btn quiet" onclick={() => session.signOut()}>Leave</button>
        </div>
      </div>
    </section>

    <section>
      <h2>Your chronicles</h2>
      {#each chronicles as c (c.$id)}
        <a class="chronicle" href={c.storytellerId === session.user.$id ? `/c/${c.$id}/screen` : `/c/${c.$id}`}>
          <span>{c.name}</span>
          <span class="caps">{c.storytellerId === session.user.$id ? 'Storyteller' : 'Player'}</span>
        </a>
      {:else}
        <p class="quiet">No table has you yet.</p>
      {/each}
    </section>

    <div class="two">
      <form class="panel" onsubmit={(e) => { e.preventDefault(); void join(); }}>
        <h2>Take a seat</h2>
        <label class="label" for="code">Invite code</label>
        <input id="code" bind:value={code} placeholder="ASHEN234" autocapitalize="characters" />
        <button class="btn solid" disabled={busy || !code.trim()}>Join</button>
      </form>

      <form class="panel" onsubmit={(e) => { e.preventDefault(); void create(); }}>
        <h2>Begin a chronicle</h2>
        <label class="label" for="cname">Name</label>
        <input id="cname" bind:value={newName} placeholder="The Ashen Court" />
        <fieldset>
          <legend class="label">When ones cancel successes to exactly zero</legend>
          <label><input type="radio" bind:group={botchRule} value="zero-with-a-one-is-a-botch" /> it's a botch</label>
          <label><input type="radio" bind:group={botchRule} value="only-negative-is-a-botch" /> it's a failure; only below zero botches</label>
        </fieldset>
        <button class="btn" disabled={busy || !newName.trim()}>Become its Storyteller</button>
      </form>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</main>

<style>
  main {
    max-width: 820px;
    margin: 0 auto;
    padding: 10vh var(--gutter) 0;
    display: grid;
    gap: 32px;
  }
  .mark {
    font-style: italic;
    font-weight: 500;
    color: var(--oxblood);
    font-size: clamp(3rem, 9vw, 5.5rem);
    margin: 0;
    line-height: 1;
  }
  .lede {
    font-size: 1.35rem;
    max-width: 34ch;
    margin: 0;
    color: var(--ink-soft);
  }
  .door,
  form {
    display: grid;
    gap: 10px;
    justify-items: start;
  }
  form input:not([type='radio']) {
    width: 100%;
  }
  .sent {
    font-style: italic;
  }
  h2 {
    font-weight: 500;
    font-size: 1.5rem;
    margin: 0 0 6px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row input {
    flex: 1;
    min-width: 12em;
  }
  .who {
    display: grid;
    gap: 6px;
  }
  .chronicle {
    display: flex;
    justify-content: space-between;
    padding: 14px 4px;
    border-bottom: 1px solid var(--rule);
    color: var(--ink);
    text-decoration: none;
    font-size: 1.3rem;
  }
  .chronicle:hover span:first-child {
    color: var(--oxblood);
  }
  .chronicle .caps {
    color: var(--ink-faint);
    font-size: 0.95rem;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  fieldset {
    border: none;
    padding: 0;
    margin: 6px 0;
    display: grid;
    gap: 4px;
  }
  .quiet {
    color: var(--ink-faint);
    font-style: italic;
  }
  @media (max-width: 700px) {
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>

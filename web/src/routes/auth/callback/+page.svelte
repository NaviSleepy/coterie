<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { session } from '$lib/session.svelte';

  let error = $state<string | null>(null);

  onMount(async () => {
    const userId = page.url.searchParams.get('userId');
    const secret = page.url.searchParams.get('secret');
    if (!userId || !secret) {
      error = 'This link is missing its seal. Ask for a new one.';
      return;
    }
    try {
      await session.complete(userId, secret);
      await goto('/', { replaceState: true });
    } catch (e) {
      error = (e as Error).message || 'This link has expired. Ask for a new one.';
    }
  });
</script>

<main>
  {#if error}
    <p class="error">{error}</p>
    <a href="/">Back to the door</a>
  {:else}
    <p>Breaking the seal…</p>
  {/if}
</main>

<style>
  main {
    max-width: 40ch;
    margin: 20vh auto;
    padding: 0 16px;
    text-align: center;
    font-style: italic;
  }
</style>

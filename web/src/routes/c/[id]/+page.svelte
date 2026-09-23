<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import type { TableState } from '$lib/table.svelte';
  import PlayerView from '$lib/components/PlayerView.svelte';

  const table = getContext<TableState>('table');

  // A Storyteller without a character of their own belongs behind the screen.
  $effect(() => {
    if (table.isStoryteller && table.mine.length === 0) void goto(`/c/${table.chronicleId}/screen`, { replaceState: true });
  });
</script>

<PlayerView {table} base={`/c/${table.chronicleId}`} />

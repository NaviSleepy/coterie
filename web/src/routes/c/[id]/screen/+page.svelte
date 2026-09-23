<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import type { TableState } from '$lib/table.svelte';
  import ScreenView from '$lib/components/ScreenView.svelte';

  const table = getContext<TableState>('table');

  $effect(() => {
    if (table.chronicle && !table.isStoryteller) void goto(`/c/${table.chronicleId}`, { replaceState: true });
  });
</script>

<ScreenView {table} />

<script lang="ts">
  import { getContext } from 'svelte';
  import type { TableState } from '$lib/table.svelte';
  import PlayerView from '$lib/components/PlayerView.svelte';

  const table = getContext<TableState>('table');
</script>

<PlayerView {table} base="/demo" canCreate={false} />

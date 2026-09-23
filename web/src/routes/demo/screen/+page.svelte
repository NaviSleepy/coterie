<script lang="ts">
  import { getContext } from 'svelte';
  import type { TableState } from '$lib/table.svelte';
  import ScreenView from '$lib/components/ScreenView.svelte';

  const table = getContext<TableState>('table');
</script>

<ScreenView {table} />

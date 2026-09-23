import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // A single-page app: every Appwrite call is made from the browser with the
    // player's own session, so there is no server of ours to render on. Appwrite
    // Sites serves build/ with index.html as the fallback.
    adapter: adapter({ fallback: 'index.html' }),
    alias: {
      $engine: '../engine/src',
      $schema: '../functions/src/shared/schema.ts',
      $shared: '../functions/src/shared',
    },
  },
};

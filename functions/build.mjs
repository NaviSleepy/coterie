// Bundles each Function into dist/<name>.js — one self-contained ESM file with
// the engine and node-appwrite inlined — so an Appwrite deployment needs no
// install step at runtime and the engine outside this folder comes along.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';

const names = readdirSync(new URL('./src/fns', import.meta.url))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.replace(/\.ts$/, ''));

await Promise.all(
  names.map((name) =>
    build({
      entryPoints: [`src/fns/${name}.ts`],
      outfile: `dist/${name}.js`,
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      // node-appwrite ships CJS; give it a require() inside the ESM bundle.
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      logLevel: 'warning',
    }),
  ),
);
console.log(`built ${names.length} functions → dist/`);

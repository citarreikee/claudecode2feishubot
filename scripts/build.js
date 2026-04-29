import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/daemon.mjs',
  external: ['@larksuiteoapi/node-sdk'],
  sourcemap: true,
});

console.log('Build complete');

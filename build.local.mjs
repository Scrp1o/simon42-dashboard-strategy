// Local build helper — NOT committed (see .git/info/exclude).
// Drives webpack via its Node API to avoid webpack-cli's broken ESM-TS-config loader.
// Usage:  node build.local.mjs [--dev]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// tsconfig.tsnode.json overrides the repo's CommonJS ts-node module setting
// back to ES2020, so `import.meta.dirname` in the webpack config compiles.
process.env.TS_NODE_PROJECT ||= 'tsconfig.tsnode.json';

// Register ts-node's ESM loader so we can import the .ts webpack config.
register('ts-node/esm', pathToFileURL('./'));

const dev = process.argv.includes('--dev');
const configPath = dev ? './webpack.dev.config.ts' : './webpack.config.ts';

let config;
try {
  config = (await import(configPath)).default;
} catch (e) {
  console.error('Failed to load config:', e?.message || e);
  if (e?.diagnosticText) console.error(e.diagnosticText);
  process.exit(1);
}
const { default: webpack } = await import('webpack');

webpack(config, (err, stats) => {
  if (err) {
    console.error(err.stack || err);
    if (err.details) console.error(err.details);
    process.exit(1);
  }
  console.log(stats.toString({ colors: true, chunks: false, modules: false }));
  process.exit(stats.hasErrors() ? 1 : 0);
});

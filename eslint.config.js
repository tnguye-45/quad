// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // dist = build output; public/leaflet = vendored library; .expo =
    // generated types; .claude = agent worktrees with divergent file copies.
    ignores: ['dist/*', 'public/**', '.expo/**', '.claude/**', 'supabase/functions/**'],
  },
]);

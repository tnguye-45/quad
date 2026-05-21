// Thin wrapper around app.json. Lets the GitHub Pages CI build inject a
// baseUrl prefix so the static export resolves under /quad/. Locally,
// EXPO_PUBLIC_BASE_URL is unset and we add nothing — `npm run web`
// behaves exactly as before.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_PUBLIC_BASE_URL;
  if (!baseUrl) return config;
  return {
    ...config,
    experiments: {
      ...(config.experiments ?? {}),
      baseUrl,
    },
  };
};

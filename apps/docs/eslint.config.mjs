import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      ".source/**",
      ".turbo/**",
      "node_modules/**",
    ],
  },
  ...nextVitals,
  {
    settings: {
      next: {
        rootDir: ".",
      },
    },
  },
];

export default config;

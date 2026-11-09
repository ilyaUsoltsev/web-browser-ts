import babelParser from "@babel/eslint-parser";

export default [
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: {
            plugins: ["typescript"],
          },
        },
      },
    },
    rules: {
      curly: ["error", "all"],
    },
  },
];

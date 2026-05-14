/** @type {import('prettier').Config} */
module.exports = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: "always",
  bracketSpacing: true,
  endOfLine: "lf",
  proseWrap: "preserve",
  overrides: [
    {
      files: ["*.md", "*.mdx"],
      options: {
        printWidth: 80,
        proseWrap: "preserve",
      },
    },
    {
      files: ["*.yml", "*.yaml"],
      options: {
        singleQuote: false,
      },
    },
  ],
};

# Firefox Lint Baseline

SnapVault treats Firefox packaging as release-gated. `npm run test:firefox:package` must pass artifact validation and the Firefox lint baseline check before a build is considered shippable.

The current accepted `web-ext lint` baseline is exactly four warnings:

1. `UNSAFE_VAR_ASSIGNMENT` in the shared `webextension-namespace` chunk.
   Rationale: this comes from bundled Preact runtime support for `dangerouslySetInnerHTML`, not from first-party `innerHTML` usage in SnapVault source.
2. `UNSAFE_VAR_ASSIGNMENT` for `import(argument 0)` in `background.js` at the on-demand content-script bootstrap site.
   Rationale: Firefox now bootstraps the packaged content-script bundle into tabs on demand so extension page actions can message the page without relying on runtime registration alone.
3. `DANGEROUS_EVAL` in `background.js`.
   Rationale: this comes from the bundled Transformers.js / ONNX Runtime Web bootstrap path that still remains in the background bundle.
4. `UNSAFE_VAR_ASSIGNMENT` for `import(argument 0)` in `background.js`.
   Rationale: this also comes from the bundled Transformers.js / ONNX Runtime Web loader path that still remains in the background bundle.

These warnings are tracked explicitly by [`scripts/check-firefox-lint.mjs`](/E:/SNAPV/scripts/check-firefox-lint.mjs). The baseline script fails if any warning disappears, changes shape, or if a new warning is introduced.

To remove the remaining warnings instead of baselining them, SnapVault would need one or more major architecture changes:

- Replace the current Preact UI runtime with a stack that does not emit the `innerHTML` branch.
- Replace the Firefox on-demand content-script bootstrap with a model that does not rely on dynamic `import()`.
- Replace the bundled Transformers.js / ONNX Runtime Web ML path with a different local inference/runtime strategy.
- Drop local ML redaction from Firefox builds.

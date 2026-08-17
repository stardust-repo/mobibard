# Offline Guitar Pro support

## Supported formats

This build supports Guitar Pro 3 (`.gp3`) and Guitar Pro 5 (`.gp5`) without a runtime network request.
ASCII tablature (`.tab`) is handled by the project's own text parser.

GP4, GPX, and modern `.gp` files are intentionally not registered until a local parser for each format is bundled and tested.
Do not add those extensions only to an HTML `accept` attribute or to the supported-files popup.

## Runtime files

The three pages load these classic scripts in order:

1. `plugins/vendor/guitarpro-parser/gp3-browser.js`
2. `plugins/vendor/parse-gp5/index.js`
3. `plugins/guitarpro-local.js`
4. `plugins/format-gp3.js`
5. `plugins/format-gp5.js`

There is no dynamic `import()`, CDN URL, `fetch()`, worker, font, or SoundFont dependency in the Guitar Pro import path.
The parser output is converted to a Standard MIDI File by `MabiMusicFormats.buildMidi()` and then passed through the existing MIDI pipeline.

## Third-party sources

- GP3: adapted from `guitarpro-parser` 1.2.0, Apache-2.0.
- GP5: browser-compatible adaptation based on `juliangruber/parse-gp5`, MIT.

Keep the corresponding license files under each `plugins/vendor` directory and keep `THIRD-PARTY-NOTICES.md` in sync.

## Regression checks

Run from the project root:

```bash
node tools/test-music-format-plugins.js
node tools/test-page-format-integration.js
```

The first test generates minimal valid GP3 and GP5 fixtures, converts them through the registered local plug-ins, checks the `MThd` MIDI header and note count, and continues through the existing MIDI/MML regression suite.
The second test checks all three pages for the same extension list and dependency order.

Before release, also search the runtime tree for stale remote loaders:

```bash
grep -RInE 'cdn\.jsdelivr|unpkg\.com|alphatab|guitarpro-alphatab' plugins simple player editor
```

The search must return no runtime reference.

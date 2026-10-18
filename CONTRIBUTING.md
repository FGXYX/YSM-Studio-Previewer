# Contributing

Thanks for helping improve YSM Studio Previewer.

## Before opening an issue

- Check that the model is a supported format (`.ysm` V1/V2/V3, or an
  unencrypted `ysm.json` folder).
- Include the app version, Windows version, GPU/WebGL renderer, and the exact
  error message or exit code.
- Describe whether the problem happens in **编辑** or **模拟** mode.
- Do not upload third-party models, textures, or audio unless you have
  permission to redistribute them. A minimal reproduction or a description of
  the model structure is preferred.

## Development

```powershell
npm ci
npm run typecheck
npm run electron:dev
npm run build
```

Useful checks:

```powershell
node scripts/smoke.mjs
node scripts/wasm-test.mjs
```

Some checks require a local Chrome installation and a running Vite server; see
the README for details.

## Pull requests

- Keep changes focused and explain the user-visible effect.
- Run `npm run typecheck` and `npm run build` before submitting.
- Do not commit generated output (`dist/`, `release/`, `node_modules/`).
- Do not commit third-party `.ysm` model packs without explicit permission.
- By submitting a contribution, you agree that it may be distributed under the
  project's MIT license.

## AI-assisted contributions

AI-assisted code is welcome, but the contributor is responsible for reviewing,
testing, and licensing it. Please mention substantial AI-generated changes in
the pull request description so reviewers can pay extra attention to security
and correctness.

## License

The original source code is licensed under the MIT License; see
[`LICENSE`](LICENSE). Third-party components and bundled assets are covered by
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

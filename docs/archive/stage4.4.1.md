# Stage 4.4.1 Bilingual Product Archive

Status: **Archived and project-owner accepted on 2026-08-08.**

- Vendored the project-owner-supplied 1.130 Simplified-Chinese language pack as a protected built-in component.
- Made fresh profiles default to `zh-cn` and retained source-message English.
- Added the two-language `becoder.displayLanguage` control under BeCoder IDE Features.
- Persisted locale before optional restart and kept all locale state inside BeCoder data.
- Hid and protected the built-in pack from normal Open VSX replacement and update paths.
- Synchronized BeCoder-owned Setup, diagnostics, Runner metadata, settings, and commands in English and Simplified Chinese.
- Backup branch: `origin/stage4.4.1`.

Future baseline upgrades must update and re-audit the pinned pack as a product component. Detailed evidence remains in `stage4-development-record.md`.

# Plugin parser fixtures

Golden-file fixtures for the Lugji Obsidian plugin parser. These files
are the **verbatim bytes** that the iOS app produces via
`MeetingMarkdownSerializer`. The plugin parser must round-trip them
losslessly into the typed domain model.

## How drift is caught

The fixture-on-both-sides pattern: iOS commits the same canonical bytes
in its own test suite (`LugjiTests/MarkdownSampleEmissionTests`), the
plugin commits them here. If either side's serializer / parser drifts
from the spec, one suite will fail and the cross-surface diff will be
visible in PR review.

Spec the fixtures conform to: `shared/product/file-format-spec.md` v1.

## Files

| File | Source | Notes |
|---|---|---|
| `2026-05-23-week-2-standup-d43e0b40.md` | iOS `MarkdownSampleEmissionTests.test_emitCanonicalSample` | Realistic Week-2 standup. Frontmatter has all required + all optional fields; body has all six sections including a Cantonese transcript and an audio embed. |
| `2026-05-21-backend-sync-7a2f9c01.md` | Reconstructed from iOS handoff `2026-05-21-testflight-build-9-transcription-live.md` | Build-9 readiness fixture. Reproduces the two spec-conformant differences iOS flagged for real build-9 files: `language: mixed` (noisy short-clip detection) and a written-Chinese (書面語) transcript (ADR-005 post-processing not wired yet). Also exercises the omit-when-empty convention — no Action Items / Key Decisions sections. **Not** a real end-to-end capture; it proves the parser is ready for build-9's shape. |
| `2026-05-22-build-21-qa-sync-b21f0e55.md` | Reconstructed from architect handoff `2026-05-21-real-file-end-to-end.md` | Build-21 readiness fixture. Build 21 swapped WhisperKit → Apple SpeechTranscriber (ADR-020); the file-format contract is unchanged, the one real difference is **~1-minute-block transcripts** (one timestamp per ~minute, not per sentence). Proves the plugin is a no-op on the new transcript shape. **Not** a real end-to-end capture — see the §"plumbing" caveat in the progress log. |
| `2026-05-25-6-244e9227.md` | **Real-device capture, iOS build 28** — replaces the stale `2026-05-22-6-e87c1252.md` build-21 fixture. Confirms the build-21-era H1 divergence (empty `#` body line) is fixed by `MeetingMarkdownSerializer.sanitiseHeading()`. Body H1 is now `# 6` as the spec requires. `language: mixed`, `duration: "<1min"`, omit-when-empty optionals. |
| `2026-05-25-新會議-417d7c83.md` | **Real-device capture, iOS build 28 — empty-title fallback path.** When the user records without a title, iOS substitutes the fallback string `"新會議"` (= `RecordingViewModel.defaultTitle` / `MeetingMarkdownSerializer.fallbackHeading`). The filename slug, the H1 and the audio basename all converge on it. The first artefact proving this path against future regression. The `pickFirstH1` cross-surface-tracker assertion in `fixture.test.ts` will fire if iOS ever changes the fallback string — prompting a coordinated plugin update. |

> **Build-21-era H1 divergence — closed.** The `2026-05-22-6-e87c1252.md`
> fixture documented an iOS serializer bug where the H1 body line was bare
> `#` even though the meeting had a title (divergence handoff
> `docs/handoff/obsidian-to-ios/2026-05-22-h1-title-divergence.md`). iOS
> build 28 fixed the serializer; the new May-25 real-device fixtures above
> confirm the fix on real-device data. The stale fixture is removed.

> **Line endings — heads-up for future fixture maintainers.** Real-device
> `.md` files from iOS use **CRLF** line endings (Swift text I/O default).
> Synthetic fixtures committed by hand use LF. `extractFrontmatter` in
> `fixture.test.ts` is line-ending agnostic (splits on `/\r?\n/`) so this
> is transparent in tests. The plugin's production path goes through
> Obsidian's metadata cache which normalises line endings, so this is
> never a runtime concern. Not a spec divergence — `file-format-spec.md`
> does not pin line endings.

## Adding a new fixture

1. Reproduce the bytes by running the iOS test that emits them:
   `cd ~/Code/Lugji/app-ios && scripts/test.sh -only-testing:LugjiTests/MarkdownSampleEmissionTests`
2. Copy the emitted file into this directory.
3. Add a test in `src/fixture.test.ts` (or a sibling) asserting parser
   behaviour on the new fixture.
4. Update the table above.

## Not in scope

These fixtures cover the **happy path** of well-formed files. Defensive
parser behaviour (malformed / missing / unknown fields) is unit-tested
directly via constructed inputs in `src/frontmatter.test.ts` — fixtures
would be the wrong tool for those because we'd be intentionally
diverging from iOS's emission.

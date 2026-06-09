# Lugji plugin — manual QA script

The plugin's parser / URL-builder / smart-linking / dashboard logic is
covered by 130 Vitest unit tests. What unit tests **cannot** cover is the
plugin actually rendering against Obsidian's real DOM inside a running
vault — the `ItemView`, the codeblock processor, the event wiring.

This script is the manual pass that closes that gap. Run it before any
release tag. Budget ~20-30 minutes.

**Tester:** ______________  **Date:** ______________
**Plugin version:** ______  **Obsidian version:** ______  **OS:** ______

---

## 0. Setup

- [ ] `cd obsidian-plugin && npm install && npm run build` — produces
      `main.js`, no errors
- [ ] Create a throwaway test vault on **desktop** Obsidian (the supported
      platform per ADR-017)
- [ ] Copy `main.js`, `manifest.json`, `styles.css` into
      `<test-vault>/.obsidian/plugins/lugji/`
- [ ] Copy both fixture files from `tests/fixtures/` into a
      `Lugji Meetings/` folder inside the test vault:
  - `2026-05-23-week-2-standup-d43e0b40.md`
  - `2026-05-21-backend-sync-7a2f9c01.md`
- [ ] `Settings → Community plugins` → enable **Lugji**
- [ ] Confirm no errors in the developer console (`Cmd/Ctrl+Shift+I`)

## 1. Happy path — metadata view

- [ ] Open `2026-05-23-week-2-standup-d43e0b40.md`
- [ ] The **Lugji meeting** side-pane opens automatically on the right
- [ ] It shows: date `2026-05-23`, duration `32min`, language (粵語 or
      `cantonese` depending on UI-language setting)
- [ ] Under "Linked notes":
  - [ ] **Date** row → `[[2026-05-23]]`
  - [ ] **Topics** row → `[[MVP]]` · `[[launch]]`
  - [ ] **Attendees** row → `[[Jerry]]` · `[[Alex]]`
- [ ] No version banner appears (this fixture is `lugji_version: 1.0.0` =
      same major)

## 2. Smart linking — interaction

- [ ] Click the `[[2026-05-23]]` date link — Obsidian navigates to (or
      offers to create) that daily note
- [ ] Click `[[Jerry]]` — same behaviour
- [ ] In the test vault, create a note named `Roadmap.md`, then edit the
      Week-2 fixture's `## Transcript` to add a line containing
      `[[Roadmap]]`
- [ ] The metadata panel's **Mentioned** row appears with `[[Roadmap]]`
- [ ] Now add `[[MVP]]` to the transcript too — confirm `MVP` does **NOT**
      appear under "Mentioned" (it is already a topic — tier-4 dedup)

## 3. Build-9 readiness fixture

- [ ] Open `2026-05-21-backend-sync-7a2f9c01.md`
- [ ] Metadata panel shows language `mixed` (混合) — no error, no banner
- [ ] "Attendees" row shows `[[Jerry]]`; "Topics" shows `[[backend]]` ·
      `[[API]]`
- [ ] The written-Chinese transcript renders normally

## 4. Version banner

- [ ] Duplicate the Week-2 fixture, change `lugji_version` to `2.0.0`
- [ ] Open it — a **warning** banner appears ("newer version… update the
      plugin")
- [ ] Duplicate again, change `lugji_version` to `0.5.0`
- [ ] Open it — an **info** banner appears ("legacy note… open in iOS app")
- [ ] Duplicate again, delete the `lugji_version` line entirely
- [ ] Open it — the legacy info banner appears (missing == legacy)

## 5. Dashboard codeblock

- [ ] Create a new note, run command **Insert meetings dashboard**
- [ ] A ` ```lugji-meetings ` codeblock is inserted
- [ ] In reading view, it renders a table with both fixture meetings,
      newest first
- [ ] Columns: Date, Title, Language, Duration, Attendees, Topics
- [ ] Click a title link — navigates to that meeting note
- [ ] Edit the codeblock to `limit: 1` — only one row renders
- [ ] Edit to `sort: date-asc` — row order reverses
- [ ] The `2.0.0` / `0.5.0` test notes from step 4 (if still in the
      folder) get a subtle warning accent on their first cell

## 6. Empty states

- [ ] Open a plain non-Lugji note — metadata panel shows "Not a Lugji
      meeting note."
- [ ] Close all notes — panel shows "No active note."
- [ ] Put a ` ```lugji-meetings ` block in a vault with the meetings
      folder set to a non-existent path — table shows the "No Lugji
      meetings found" empty state, no crash

## 7. Commands + settings

- [ ] `Settings → Lugji` — three settings visible: Meetings folder,
      Smart linking toggle, UI language
- [ ] Switch UI language to English — reopen a meeting, panel labels are
      English; switch back to 繁體中文 — labels are Cantonese
- [ ] Command **Start recording** — attempts to open `lugji://` (will
      no-op without the iOS app installed; should not crash Obsidian)
- [ ] Command **Show meeting metadata** — reveals the side-pane
- [ ] Disable then re-enable the plugin — no console errors, side-pane
      state is sane

## 8. Real-device file validation

The fixtures in `tests/fixtures/` are synthetic. This step validates the
plugin against a **real** `.md` produced by a real build-21+ recording.

- [ ] Record a meeting on the Lugji iOS app (build 21 or newer)
- [ ] Get the real `.md` **and** its `.m4a` onto the Mac — AirDrop is
      fine (and is required if iPhone + Mac use different Apple IDs)
- [ ] Drop both files into the test vault's `Lugji Meetings` folder
- [ ] Open the real meeting note — metadata panel renders, no console
      errors
- [ ] The ~1-minute-block transcript displays cleanly
- [ ] Smart-linking tiers render; the audio embed resolves to the real
      `.m4a` (filename basenames match)
- [ ] The meeting appears in a `lugji-meetings` dashboard
- [ ] Watch for the 4 divergence categories — report any of:
  - frontmatter the panel can't show / shows wrong
  - body sections out of spec order
  - audio embed pointing at a missing file (basename mismatch)
  - `lugji_version` anything other than `1.0.0`

If anything diverges, it goes in a handoff to iOS, not just the notes
box below.

## 9. Sign-off

- [ ] All boxes above checked, or deviations noted below
- [ ] Developer console is free of Lugji-originated errors throughout

**Deviations / bugs found:**

```
(none — or list here)
```

**Verdict:** ☐ Ready to tag a release  ☐ Needs fixes (see above)

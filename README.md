# Lugji for Obsidian

Bring your **Lugji** meeting notes to life inside Obsidian — metadata at a
glance, smart links into your existing notes, and a meetings dashboard.

> **This plugin is optional.** [Lugji](https://lugji.app) (the iPhone app)
> writes meeting notes straight into the Obsidian vault folder you pick —
> that core integration works without any plugin. This plugin layers
> convenience features on top: a pretty side-pane metadata view, 4-tier
> smart linking, a dashboard codeblock, and a version-mismatch banner.
> Install for the power-user feel; skip it and the meetings still land in
> your vault, fully readable.

[Lugji](https://lugji.app) is a Cantonese + Mandarin meeting-recording
app for iPhone. It transcribes on-device, writes a clean Markdown note for
every meeting, and saves it straight into your vault. This plugin is the
optional Obsidian enhancement on top of that.

---

## Where it works

- ✅ **Mac / Windows / Linux Obsidian** (desktop) — fully supported.
- ✅ **iPhone / iPad Obsidian** (mobile) — fully supported via the Lugji iOS
  app's vault-picker. Setup steps below.

Plugin code runs everywhere Obsidian runs. The setup story differs slightly
between desktop and mobile because the iOS Lugji app needs to know where to
write the meeting markdown.

---

## What it does

- **Meeting metadata panel** — a side-pane view that shows date, language,
  duration, and the smart-linking results for the meeting note you're
  reading. Opens automatically the first time you open a Lugji meeting.
- **Smart linking** — a 4-tier cascade that connects each meeting into your
  existing knowledge graph:
  1. **Topics** → `[[wikilinks]]`
  2. **Attendees** → `[[Person]]` links
  3. **Date** → a link to that day's daily note (always present)
  4. **Transcript scan** → surfaces any `[[wikilinks]]` you've already added
     in the transcript
- **Meetings dashboard** — drop a ` ```lugji-meetings ` codeblock into any
  note for a sortable table of every meeting (see below). No dependency on
  the Dataview plugin.
- **Version-aware** — if a meeting note was written by a newer or older
  Lugji schema than this plugin understands, a small banner explains what to
  do, and the plugin still renders everything it can.
- **Start recording from Obsidian** — a command + ribbon icon that opens the
  Lugji iOS app straight at a new recording.

## Requirements

- Obsidian **desktop** 1.4.0 or newer (see the desktop requirement above).
- The [Lugji iOS app](https://lugji.app) to actually record meetings.
- iCloud Drive enabled on your iPhone and your Mac.

## Install

### From Obsidian Community Plugins

Search for **Lugji** in `Settings → Community plugins → Browse`, install,
and enable.

### Manual

Copy `main.js`, `manifest.json` and `styles.css` into
`<your vault>/.obsidian/plugins/lugji/` and enable the plugin in
`Settings → Community plugins`.

## Connecting the Lugji app to your vault

The plugin watches a `Lugji Meetings` folder **inside your Obsidian vault**.
The Lugji iOS app writes meetings straight into the vault folder you pick —
no AirDrop, no manual file copy, no iCloud-Drive intermediary.

### On iPhone / iPad (Obsidian mobile)

1. Open Obsidian on your device and create or open the vault you want
   meetings to land in.
2. In the Lugji iOS app → tap the gear icon (top-right) → **Obsidian** →
   tap **揀資料夾** / **換另一個資料夾**.
3. In the folder picker, navigate to the SAME folder Obsidian is using
   as your vault, then tap **開啟**.
4. Record a meeting in Lugji. The markdown lands inside that vault's
   `Lugji Meetings` subfolder right away.
5. Open the new meeting note in Obsidian — the metadata panel appears
   the first time you do.

### On Mac (Obsidian desktop)

Two paths, both work:

**Same setup as iPhone above** — Lugji iOS picks a folder via iCloud Drive
(or wherever your Mac vault lives accessibly from iPhone), writes there, your
Mac Obsidian sees the file when iCloud syncs.

**Or**, if your iPhone Lugji writes to its own iCloud container (the older
flow before build 23), your Mac can open that container directly as a vault
under `iCloud Drive/Lugji Meetings/`. Either way works on Mac.

### If you want to AirDrop / manually copy files instead

You can still skip the auto-write flow entirely: AirDrop each meeting's
`.md` (and `.m4a` if you want audio) from your iPhone to your Mac / iPad,
and drop both files into your vault's `Lugji Meetings` folder. The plugin
picks them up immediately. Useful when your iPhone and Mac use different
Apple IDs, or when you prefer not to grant the iOS app access to a shared
folder.

### Settings

In `Settings → Lugji` (Obsidian), the **Meetings folder** option lets you
point the plugin at any subfolder name (default: `Lugji Meetings`). Keep it
matching what the iOS Lugji app writes to — both surfaces default to the same
name, so most people never touch this.

## Usage

### Meetings dashboard

Insert this codeblock anywhere (or use the command **Insert meetings
dashboard**):

````markdown
```lugji-meetings
sort: date-desc
limit: 20
```
````

Options (all optional):

| Key | Values | Default |
|-----|--------|---------|
| `sort` | `date-desc`, `date-asc` | `date-desc` |
| `limit` | a positive integer | no limit |

### Commands

| Command | What it does |
|---------|--------------|
| Start recording | Opens the Lugji iOS app at a new recording |
| Show meeting metadata | Reveals the metadata side-pane |
| Insert meetings dashboard | Inserts a `lugji-meetings` codeblock |
| Open iOS settings | Opens the Lugji iOS app's settings |

## Using with Dataview (optional)

This plugin does **not** require the
[Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin — the
`lugji-meetings` dashboard above is self-contained. But Lugji meeting notes
carry clean YAML frontmatter, so if you already use Dataview you can build
your own views. For example:

````markdown
```dataview
TABLE language, duration, topics
FROM "Lugji Meetings"
WHERE type = "meeting"
SORT date DESC
```
````

The frontmatter fields available to query: `date`, `type`, `language`,
`duration`, `attendees`, `topics`, `tags`, `lugji_meeting_id`,
`lugji_version`.

## Privacy

Lugji is privacy-first. Audio never leaves your device; transcription happens
on-device. This plugin only reads the Markdown notes already in your vault —
it makes no network requests and sends nothing anywhere.

## Development

```bash
npm install
npm run dev     # esbuild watch
npm run build   # type-check + production bundle
npm run test    # vitest
npm run lint    # eslint
```

The plugin's parser / URL-builder / smart-linking logic is covered by a
Vitest suite (`src/*.test.ts`). The file-format contract the plugin parses is
documented in `shared/product/file-format-spec.md` of the Lugji monorepo.

## Links

- Website: [lugji.app](https://lugji.app)
- Built in Hong Kong with 獅子山精神. The name "Lugji" comes from 錄音 + 記低.

# Notes: rendering and editing

Notes exist on todos (cards and kanban cards) and on projects (the project notes pane). All three surfaces share the same markdown pipeline (`src/renderer/utils/markdown.js`) and the same CodeMirror editor (`NotesEditor.vue`).

## Markdown rendering

- GitHub-flavored markdown with `breaks: true`: a single newline inside a paragraph renders as a line break.
- List indentation is normalized so 2-space nesting renders as nested lists (see `preprocessMarkdown`).
- An indented list marker with no text (a bullet the user has started but not filled in, e.g. `  -` under a nested list) renders as an empty bullet. Without this, marked reads the bare marker as a setext heading underline, which turns the parent item into a heading and flattens its children into it. Top-level empty markers already render as empty bullets and are left alone.
- Blank lines are preserved line for line: every blank line in the editor renders as one empty line in the preview, so the vertical spacing the user typed is never collapsed. This intentionally departs from standard markdown, which collapses any run of blank lines into a single paragraph break. Blank lines inside fenced code blocks are untouched (code blocks already preserve them verbatim), and trailing blank lines at the end of a note are dropped.
- Output is sanitized with DOMPurify against an element allowlist.
- Typography: note body text renders at 13px; heading sizes step down from h1 (1.4em) to h4 (1.05em) and never drop below the body text size (h5 and h6 render at 1em). Because the lower size steps are small, levels are also distinguished by weight (h1/h2 bold, h3-h6 semibold). Card notes use the same styles with compact (zero) heading margins.

## View / edit switching

The rendered view is the resting state on every surface. Clicking anywhere on the rendered notes switches that surface to the editor, and the editor receives keyboard focus immediately, so the user can type without a second click. Leaving the editor saves the notes and returns to the rendered view.

Surfaces:

- Project notes pane: click the rendered notes to edit (the Edit/View buttons also switch modes).
- Card notes (cards view) and kanban card notes: click the rendered notes to edit.
- Full-screen card (see [Full-screen card](fullscreen.md)): click the rendered notes to edit; the editor fills the overlay.

What counts as leaving the editor - and why switching to another application does not - is described in [Inline editing](editing.md).

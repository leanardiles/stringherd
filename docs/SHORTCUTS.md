# Keyboard shortcuts

The review screen follows [Phrase's CAT editor shortcuts](https://support.phrase.com/hc/en-us/articles/5709700557468) wherever Phrase has the same action, so linguists can use what they already know. On macOS, `Cmd` (⌘) replaces `Ctrl`, `Option` (⌥) replaces `Alt`, and the reference in the app shows the Mac symbols.

In Stringherd, open the reference with `Ctrl+/`, with `?` when the cursor is not in a text field, with the keyboard icon in the review toolbar, or with **Keyboard shortcuts** in the account menu.

The list in the app comes from `web/src/lib/shortcuts.ts`, which also drives the key handling. A test checks that every shortcut there appears on this page.

## Review

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Approve and go to the next string |
| `Ctrl+Shift+Enter` | Withdraw the approval |
| `Esc` | Discard the unsaved edit; in the list view, close the open string |

## Edit

| Shortcut | Action |
|---|---|
| `Ctrl+Insert` | Copy the source text into the translation |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

## Insert

| Shortcut | Action |
|---|---|
| `Ctrl+1 … Ctrl+9` | Insert suggestion 1 to 9 (suggestion 1 is DeepL's translation) |
| `Ctrl+Space` | Insert the selected suggestion |
| `Ctrl+↑` | Select the previous suggestion |
| `Ctrl+↓` | Select the next suggestion |
| `F8` | Insert the next placeholder from the source that the translation is missing |
| `Ctrl+Shift+F8` | Insert all missing placeholders |
| `Ctrl+Shift+Space` | Insert a non-breaking space (U+00A0), for example before `? ! : ;` in French |

## Navigate

| Shortcut | Action |
|---|---|
| `↑` | Previous string, with the cursor on the first line of the translation |
| `↓` | Next string, with the cursor on the last line of the translation |
| `Alt+↑` | Previous string that still needs review |
| `Alt+↓` | Next string that still needs review |
| `Ctrl+Home` | First string |
| `Ctrl+End` | Last string |
| `Ctrl+G` | Go to a string by its number or key |
| `Ctrl+Shift+F` | Search for the selected text |

## View

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+←` | Move the focus to the previous pane |
| `Ctrl+Alt+→` | Move the focus to the next pane |
| `Alt+N` | Move the focus to the context panel |
| `Ctrl+/` | Show all shortcuts |
| `?` | Show all shortcuts (when the cursor is not in a text field) |

**Show non-printable characters**, in the review toolbar, makes spaces visible: `·` a space, `°` a non-breaking space, a smaller `°` a narrow non-breaking space, `→` a tab. The choice is remembered on this computer.

## Not included

Phrase's `F9` (run QA) is left out: Stringherd checks each string as you type. Find and replace (`Ctrl+H`), translation memory and glossary search (`Ctrl+K`) and comments (`Ctrl+M`) come with those features.

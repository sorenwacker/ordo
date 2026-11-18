# Auto-Update

Updates are distributed through GitHub releases and checked by
`electron-updater` five seconds after launch and every four hours
(`src/main/updater.js`, intervals in `src/config/constants.js`). Only
published (non-draft) releases are visible to the updater.

## Windows and Linux

Updates download automatically. When ready, a dialog offers to restart now
or install on quit.

## macOS

macOS's update mechanism (Squirrel.Mac) verifies code signatures and
refuses to install unsigned or ad-hoc-signed builds. The current build is
ad-hoc signed by electron-builder (`build.mac.identity: "-"` in `package.json`), so
automatic installation is impossible: the update would download, the
install would silently fail, and the app would re-prompt after every check
while staying on the old version.

The updater therefore runs in notify-only mode on macOS while
`MAC_BUILD_SIGNED` (`src/config/constants.js`) is `false`:

- Nothing is downloaded automatically and no install is promised.
- When an update is detected, a dialog names the available version once,
  with three choices:
    - **Download**: opens the GitHub releases page in the browser; the user
      installs the DMG manually.
    - **Later**: no further prompt until the next app launch.
    - **Skip This Version**: stored in the settings table
      (`skipped-update-version`); that version never prompts again.
- Each version prompts at most once per app run.

## Enabling signed macOS builds

Requires an Apple Developer Program membership (US$99/year). Steps:

1. Create a **Developer ID Application** certificate in the Apple
   Developer portal and export it with its private key as a `.p12` file.
2. Add repository secrets for the release workflow: `CSC_LINK` (base64 of
   the `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
3. In `package.json` `build.mac`: remove `identity: "-"` and
   `hardenedRuntime: false`, set `notarize: true`.
4. Set `MAC_BUILD_SIGNED` to `true` so macOS uses the automatic
   download-and-install flow.

From the next signed release onward, macOS auto-update works and Gatekeeper
no longer requires right-click → Open on first launch.

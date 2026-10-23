# Security Policy

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting: <https://github.com/heronlabs/fly/security/advisories/new>. Do not open a public issue, pull request or discussion for a vulnerability.

Expect a response within 72 hours. After triage we will keep you updated on progress and coordinate disclosure timing.

## Scope

`fly` is a desktop app that runs on your own machine. It handles:

- the local `tmux`, `git`, `gh`, `claude` and `code` commands, which it runs as your user, with the `PATH` and `LANG` of your login shell;
- the files of the worktree you select: the explorer and the editor read and write only paths inside that worktree's real path, refuse anything outside it, create new files exclusively and never follow a symlink out of the worktree;
- its own settings, a JSON file in the app's data directory, and the images you paste into a terminal, saved as PNG files under the system temp folder;
- the renderer, which has no Node integration and runs with context isolation: it reaches the main process only through the `window.fly` API that the preload script exposes with `contextBridge`, cannot navigate away from the app or open new windows, and opens only `https:` links in your browser.

What Claude Code does inside a session is governed by Claude Code and its own permission settings, not by fly.

### Supported versions

| Version | Supported |
|---------|-----------|
| latest release | ✅ |
| older | ❌ |

## Secrets

- No secret is ever committed to this repository.
- fly stores no credential of its own. `gh` and Claude Code keep their credentials in their own configuration; fly calls them and never reads, copies or stores those credentials.

## Disclosure

We follow coordinated disclosure. After a fix is released we will publish a GitHub Security Advisory and credit reporters (unless you prefer anonymity).

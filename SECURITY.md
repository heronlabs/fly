# Security Policy

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting: <https://github.com/heronlabs/fly/security/advisories/new>. Do not open a public issue, pull request or discussion for a vulnerability.

Expect a response within 72 hours. After triage we will keep you updated on progress and coordinate disclosure timing.

## Scope

`fly` is a desktop app that runs on your own machine. It handles:

- the local `tmux`, `git`, `gh` and `claude` commands, which it runs as your user, with the `PATH` and `LANG` of your login shell;
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
- The release workflow signs the app with fly's self-signed certificate (SHA-1 `09663078c96575a9f688f6b62b61ea4ddac1528a`, SHA-256 `1E:21:3D:42:B8:83:A0:FC:00:E4:36:F0:98:95:75:2B:72:B6:8D:A7:0D:08:33:DE:2E:27:EE:B2:76:0E:DF:02`). Its p12 and password are secrets (`MAC_CERT_P12`, `MAC_CERT_PASSWORD`) of the GitHub environment `release`, which only `main` can deploy to, and only the keychain step of the release job reads them. The key is imported non-extractable, and the keychain is deleted right after the build. The owner keeps the only other copy in a password manager. Whoever holds that key can sign code macOS treats as fly, with the permissions given to fly.
- If that key leaks, a new certificate replaces it; its fingerprint is published here and in a GitHub Security Advisory. Users then reset what they granted to the old one (`tccutil reset All com.heronlabs.fly`) and grant fly's permissions again.
- Every dmg on a Release carries a build provenance attestation: `gh attestation verify <dmg> --repo heronlabs/fly` proves it was built by fly's release workflow.
- fly stores no credential of its own. `gh` and Claude Code keep their credentials in their own configuration; fly calls them and never reads, copies or stores those credentials.

## Disclosure

We follow coordinated disclosure. After a fix is released we will publish a GitHub Security Advisory and credit reporters (unless you prefer anonymity).

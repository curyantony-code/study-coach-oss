# Security

Study Coach runs a small web server on your own computer (`127.0.0.1` only) and reads note
folders you choose. Please report anything that could let another website, another user on
the network or a crafted note file read or change files, run commands, or reach your AI keys.

**Please don't open a public issue for security problems.** Use GitHub's
**Security → Report a vulnerability** on this repository instead. You'll get a reply within
a week.

Things the app is designed to guarantee:

- The server only answers requests addressed to localhost (`proxy.ts`).
- Vaults are read-only unless writing is switched on for that vault and each save is confirmed.
- External tools (Poppler, Tesseract) are run with argument lists, never shell strings.
- The app never ships with an AI key. Every user brings their own, and AI features stay off
  until they do. Builds fail if a settings file or anything shaped like a key would be packaged
  (`scripts/no-keys.mjs`, run by the desktop build and CI).
- AI keys are read from local settings files and are never sent anywhere except the AI
  provider they belong to.

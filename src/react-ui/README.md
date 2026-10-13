# Onefinity Next UI

React interface served at `/next` on the controller. The original UI at `/` is unchanged.

- `npm install && npm run build` writes to `src/resources/next/` (the Makefile copies it to `http/next/`).
- `npm run mock` starts a fake controller on :8080 that also serves `/next/` for UI work without a machine.
- Jogging is step-based for now; continuous jog, Settings, Tool and I/O screens still live in the original UI.

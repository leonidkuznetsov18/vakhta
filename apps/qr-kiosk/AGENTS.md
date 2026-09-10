# Kiosk boundary

- Preserve the vanilla Vite runtime until an explicit architecture decision changes it. Use feature
  ownership without importing React/FSD presentation machinery merely for directory consistency.
- Device credentials belong to the paired terminal/browser. Never bake tokens into bundles or capture
  QR values in logs/screenshots committed to the repo. Pairing replacement can invalidate a live kiosk.
- Challenge refresh must tolerate slow/offline requests and terminal switching; only the currently
  selected terminal may own the visible QR. Test expiry/recovery and touch/fullscreen readability.

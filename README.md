# Shift planner

Plans fair shift rosters in the browser. You list the people, the positions that need staffing and when they
need it; the planner assigns shifts so everyone carries an even share of the work, within your rules for shift
length and rest.

**Try it:** https://michael-3-141.github.io/shift-planner/

- Works on phones and desktops, in English or Hebrew, light or dark.
- Handovers on a 15-minute, 30-minute or hourly grid.
- Pin shifts you want to keep, record time off, and re-plan whenever things change.
- Optional preferred handover times, such as every 4 hours from 02:00.
- Export the schedule as an image or an Excel timeline.

Everything runs on your device. Your data stays in your browser; nothing is sent anywhere. Use
**Settings → Data → Export file** to back it up or move it to another device.

## How it works

Planning uses Google's [CP-SAT](https://developers.google.com/optimization/cp/cp_solver) solver, compiled to
WebAssembly ([or-tools-wasm](https://www.npmjs.com/package/or-tools-wasm)). It first makes the workload as even
as possible, then tidies up: fewer, longer shifts, and handovers at your preferred times.

The solver uses several threads, which browsers only allow on cross-origin isolated pages. Hosts that can set
headers should send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
(`public/_headers` does this on Netlify and Cloudflare Pages). On GitHub Pages, which can't,
`public/coi-serviceworker.js` adds them instead.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # vitest; the solver tests take a few minutes
npm run build    # type check and build into dist/
```

Pushing to `main` deploys to GitHub Pages.

# Cubicle

A frontend-only, playable 3D office for practicing workplace conversations.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a static production build in `dist`; `npm run preview` previews that build.

## Play

- Move with WASD or arrow keys, click the floor, or use the mobile direction controls.
- Approach Maya, Jordan, or Sam and press E or click the conversation prompt.
- Choose replies with a mouse or the 1–3 keys. Escape closes conversations and help.
- Change the scenario in the sidebar. Each manager conversation has its own script and feedback.
- Progress is stored in localStorage on this browser. No server, account, API key, or AI service is needed.

Built with Three.js, Lucide, and Vite. All office geometry and characters are generated locally. Google Fonts is optional; system fonts are used when unavailable. WebGL is required.

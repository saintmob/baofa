<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/328f1f1f-1bc9-4087-b227-2d41af8a6280

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local`
3. Optional: set the `VITE_FIREBASE_*` values in `.env.local` to enable multi-screen sync
4. Optional: set `GEMINI_API_KEY` if you are running this through AI Studio
5. Run the app:
   `npm run dev`

Local runtime is fixed to `http://localhost:4303` for baofa, `http://localhost:4300` for show control, and `ws://localhost:4300/ws` for control transport. VJ target screens are opened directly at `http://localhost:4302/screen/<screenId>`; baofa does not embed them in an iframe.

Without Firebase values, the app still runs locally as a single-screen preview and shows sync as disabled.

See [docs/multi-screen-routing.md](docs/multi-screen-routing.md) for the routing map.

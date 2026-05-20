# Multi-screen Routing

baofa uses fixed local ports during现场运行:

- `baofa` native screen: `http://localhost:4303`
- show-control backend: `http://localhost:4300`
- show-control websocket: `ws://localhost:4300/ws`
- external VJ screen route: `http://localhost:4302/screen/<screenId>`

Routing rules:

- Open baofa directly on `http://localhost:4303` for the native controller and preview surface.
- Open VJ target screens directly on `http://localhost:4302/screen/<screenId>`.
- Do not embed the VJ screen inside baofa with an iframe.
- Keep VJ routing as an external browser target so each screen stays isolated.

The active screen ID is still managed inside baofa, but the external VJ address is just a derived URL from that ID.

# Show Control Configuration

Use local `.env` files or deployment platform environment variables for show-control settings.
Do not commit `.env*` files.

Required remote keys:

```env
VITE_SHOW_TRANSPORT="firebase"
VITE_SHOW_ID="show-main"
VITE_SHOW_BACKEND_URL="http://localhost:4300"
VITE_SHOW_WS_URL="ws://localhost:4300/ws"
VITE_CONTROL_TOKEN=""
VITE_FIREBASE_API_KEY="<firebase-web-api-key>"
VITE_FIREBASE_AUTH_DOMAIN="<project>.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="<project-id>"
VITE_FIREBASE_DATABASE_URL="<realtime-database-url>"
VITE_FIREBASE_STORAGE_BUCKET="<bucket>"
VITE_FIREBASE_MESSAGING_SENDER_ID="<sender-id>"
VITE_FIREBASE_APP_ID="<app-id>"
```

Local defaults in code follow the same endpoints, so the app boots against `http://localhost:4300` and `ws://localhost:4300/ws` unless a `.env` override is provided.

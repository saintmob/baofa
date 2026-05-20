# Show Control Configuration

Use local `.env` files or deployment platform environment variables for show-control settings.
Do not commit `.env*` files.

Required remote keys:

```env
VITE_SHOW_TRANSPORT="firebase"
VITE_SHOW_ID="show-main"
VITE_SHOW_BACKEND_URL="https://your-backend.example.com"
VITE_SHOW_WS_URL=""
VITE_CONTROL_TOKEN=""
VITE_FIREBASE_API_KEY="<firebase-web-api-key>"
VITE_FIREBASE_AUTH_DOMAIN="<project>.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="<project-id>"
VITE_FIREBASE_DATABASE_URL="<realtime-database-url>"
VITE_FIREBASE_STORAGE_BUCKET="<bucket>"
VITE_FIREBASE_MESSAGING_SENDER_ID="<sender-id>"
VITE_FIREBASE_APP_ID="<app-id>"
```

# Roche Photo Registration

Mobile registration page for the Unity photo wall.

Run locally from this folder with any static HTTP server, for example:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`. Camera capture works best when the deployed page is served over HTTPS.

The page writes each entry to `/submissions/{id}` and mirrors it to `/latest` in Firebase Realtime Database. The Unity viewer polls `/latest.json` once per second.

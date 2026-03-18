# RHYTHMIQ Stable Deploy

This repo is prepared for a single-domain Render deployment:

- Website and API are served from the same service
- Admin lives at `/admin/login` on the same domain
- Google login only needs one stable authorized origin

## Recommended Host

Render web service with the included `render.yaml`.

Official docs used:
- https://render.com/docs/web-services
- https://render.com/docs
- https://developers.google.com/admin-sdk/directory/v1/guides/troubleshoot-authentication-authorization

## Deploy Steps

1. Push this folder to a GitHub or GitLab repository.
2. In Render, create a new Blueprint from that repo.
3. Keep the service on the `Starter` plan or higher so the persistent disk works.
4. In the service environment, set these values:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REACT_APP_GOOGLE_CLIENT_ID`
     Use the same value as `GOOGLE_CLIENT_ID`.
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - Optional: `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`
5. Deploy the service.

## Stable URLs After Deploy

If Render gives you a URL like:

`https://rhythmiq.onrender.com`

Then use:

- Website: `https://rhythmiq.onrender.com`
- Admin: `https://rhythmiq.onrender.com/admin/login`

## Google OAuth Setup

In Google Cloud Console, add this stable origin:

`https://your-service-name.onrender.com`

Under the OAuth web client:

- Authorized JavaScript origins:
  Add the Render URL above.
- Keep your existing localhost origin for local development if you want.

Google's docs state that `origin_mismatch` happens when the browser origin does not match an authorized JavaScript origin for the OAuth client.

## Notes

- The service stores SQLite at `/var/data/rhythmiq.db` on Render.
- The app already serves the built frontend from FastAPI, so one domain covers both frontend and backend.
- If you want a fully branded production setup, point a custom domain to Render and add that domain to Google OAuth instead of the `onrender.com` URL.

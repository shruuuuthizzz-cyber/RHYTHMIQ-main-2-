# RHYTHMIQ - Music Identity Platform PRD

## Original Problem Statement
Build RHYTHMIQ - a next-gen music streaming & discovery platform with AI-driven personalization, time-aware curation, and deep song analysis. All features must be properly implemented with smooth animations and fast performance. Uses Supabase for database.

## Architecture
- **Frontend**: React 18 + Tailwind CSS + Shadcn UI + Framer Motion + Recharts
- **Backend**: FastAPI (Python) with SQLAlchemy ORM
- **Database**: Supabase PostgreSQL (via Transaction Pooler + Alembic migrations)
- **Music Data**: Spotify Web API (with comprehensive sample data fallback)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key (LYRA assistant)
- **Auth**: JWT-based custom authentication

## User Personas
1. **Music Explorer**: Discovers new music through search, recommendations, time-of-day suggestions
2. **Playlist Curator**: Creates and manages playlists, likes songs, rates tracks
3. **Data Nerd**: Views Music DNA profile with genre/mood breakdown charts
4. **AI Chat User**: Converses with LYRA AI for personalized music recommendations

## Core Requirements
- [x] User Authentication (Register/Login with JWT)
- [x] Music Search with autocomplete & tabs (Tracks, Artists, Albums)
- [x] Music Player with controls (play, pause, skip, seek, shuffle, repeat)
- [x] Playlists CRUD (create, view, add/remove songs, delete)
- [x] Liked Songs Library with toggle
- [x] 5-Star Rating System
- [x] Music DNA Profile (genre pie chart, mood radar, top artists)
- [x] Time-of-Day Suggestions (Morning, Afternoon, Evening, Night, Late Night)
- [x] Song Deep-Dive Card (BPM, key, energy, danceability, instruments, moods)
- [x] Artist Pages (bio, top tracks, albums, related artists)
- [x] Album Pages (track listing, release info)
- [x] LYRA AI Voice Assistant (Claude Sonnet 4.5 chat)
- [x] Listening History logging
- [x] Persistent bottom player bar
- [x] Mobile-responsive layout with sidebar navigation

## What's Been Implemented (March 11, 2026)
### Backend (17 API endpoints, all tested passing)
- Auth: register, login, me
- Spotify proxy: search, track, artist, album, features, top-tracks, related, browse
- Playlists: CRUD + add/remove songs
- Likes: toggle, list, check
- Ratings: set, list, check
- History: log, list
- Music DNA: calculate from user data
- LYRA AI: chat with Claude Sonnet 4.5
- Song Deep Dive: audio features analysis
- Time-of-Day Suggestions: search-based recommendations

### Frontend (9 pages, all functional)
- Auth Page (login/register with animated transitions)
- Home Page (time greeting, suggested tracks, new releases, recommendations)
- Search Page (debounced search, tabs for tracks/artists/albums, quick searches)
- Library Page (playlists list, liked songs, create playlist dialog)
- Playlist Detail Page (track listing, remove songs)
- Artist Page (hero banner, top tracks, discography, related artists)
- Album Page (track listing, release info)
- Music DNA Page (genre pie chart, mood radar, top artists, stats)
- LYRA AI Page (chat interface, suggestion buttons, message history)

### Design System: "Electric Midnight"
- Dark theme (#050505 base)
- Neon orange primary (#FF4D00)
- Cyan secondary (#00F0FF)
- Chartreuse accent (#CCFF00)
- Fonts: Syne (headings), Clash Display (subheadings), Manrope (body)
- Glassmorphism, sound bar animations, noise texture overlay

## Known Limitations
- Spotify API returns 403 (Development Mode without Premium). All endpoints gracefully fall back to comprehensive sample data.
- Sample tracks don't have audio preview URLs, so music playback shows "Preview N/A"
- Music DNA requires user interaction data (likes, ratings, history) to populate

## Prioritized Backlog
### P0 (Next)
- Upgrade Spotify Developer App to Extended Quota Mode for real music data
- Add real audio preview URLs for playback
- Implement collaborative playlists

### P1
- Equalizer visualization on player bar
- Recently played section on home page
- Song lyrics integration
- Share playlists/DNA profile

### P2
- Social features (follow users, friend activity)
- Offline caching
- Push notifications
- Podcasts support

## Next Tasks
1. Get Spotify Extended Quota Mode approved for real data
2. Add drag-and-drop playlist reordering
3. Implement weekly Music DNA snapshot comparison
4. Add mobile bottom navigation bar improvements
5. Add user profile settings page

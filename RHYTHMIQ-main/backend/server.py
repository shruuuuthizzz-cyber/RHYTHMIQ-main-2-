from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import re
import json
import asyncio
import time
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from sqlalchemy import select, delete, func, and_, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from urllib import parse as urllib_parse
from urllib import request as urllib_request
import requests

from openai import AsyncOpenAI
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_auth_requests

try:
    from yt_dlp import YoutubeDL
except ImportError:
    YoutubeDL = None

try:
    from .database import get_db, engine, Base, AsyncSessionLocal, DATABASE_URL
    from .models import User, Playlist, PlaylistSong, Like, Rating, ListeningHistory, DNASnapshot, LyraMessage, EmailVerification, OAuthIdentity, EmailCampaign, UserLogin, AdminRecommendation, PasswordResetToken
    from .supabase_client import get_supabase_user, ping_supabase, supabase_enabled
    from .sample_data import (SAMPLE_TRACKS, SAMPLE_ARTISTS, SAMPLE_ALBUMS, SAMPLE_AUDIO_FEATURES,
                              get_sample_tracks_for_period, search_sample_data)
except ImportError:
    from database import get_db, engine, Base, AsyncSessionLocal, DATABASE_URL
    from models import User, Playlist, PlaylistSong, Like, Rating, ListeningHistory, DNASnapshot, LyraMessage, EmailVerification, OAuthIdentity, EmailCampaign, UserLogin, AdminRecommendation, PasswordResetToken
    from supabase_client import get_supabase_user, ping_supabase, supabase_enabled
    from sample_data import (SAMPLE_TRACKS, SAMPLE_ARTISTS, SAMPLE_ALBUMS, SAMPLE_AUDIO_FEATURES,
                             get_sample_tracks_for_period, search_sample_data)

ROOT_DIR = Path(__file__).parent
FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"
load_dotenv(ROOT_DIR / '.env.local')
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')
JWT_ALGORITHM = 'HS256'

# Spotify Client
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET')

if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
    sp_credentials = SpotifyClientCredentials(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET
    )
    sp = spotipy.Spotify(client_credentials_manager=sp_credentials)
else:
    sp = None
    logger.warning("Spotify credentials not found in environment; falling back to sample data.")

# Emergent LLM
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
LYRA_MODEL = os.environ.get('LYRA_MODEL', 'gpt-4o-mini')
LYRA_PROVIDER = os.environ.get('LYRA_PROVIDER', '').lower()
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
BREVO_API_KEY = os.environ.get('BREVO_API_KEY')
BREVO_SENDER_EMAIL = os.environ.get('BREVO_SENDER_EMAIL')
BREVO_SENDER_NAME = os.environ.get('BREVO_SENDER_NAME', 'RHYTHMIQ')
FRONTEND_URL = os.environ.get('FRONTEND_URL') or os.environ.get('RENDER_EXTERNAL_URL') or 'http://127.0.0.1:3000'
YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY')
YOUTUBE_SEARCH_CACHE_TTL = 60 * 60 * 12
YOUTUBE_AUDIO_CACHE_TTL = 60 * 20
youtube_search_cache = {}
youtube_audio_cache = {}
youtube_catalog_cache = {}
youtube_data_api_available = bool(YOUTUBE_API_KEY)

DEFAULT_ADMIN_PASSWORD = os.environ.get('DEFAULT_ADMIN_PASSWORD', 'rhythmiq@2026')
DEFAULT_ADMIN_ACCOUNTS = [
    {"username": "Devangipradhan", "email": "devangipradhan@rhythmiq.com"},
    {"username": "Shruthishirgaonkar", "email": "shruthishirgaonkar@rhythmiq.com"},
]
ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()]
if not ADMIN_EMAILS:
    ADMIN_EMAILS = [account["email"] for account in DEFAULT_ADMIN_ACCOUNTS]

def is_admin_user(user):
    return bool(user and user.email and user.email.lower() in ADMIN_EMAILS)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def password_matches(password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except ValueError:
        return False


async def ensure_default_admin_accounts(db: AsyncSession) -> None:
    changed = False

    for account in DEFAULT_ADMIN_ACCOUNTS:
        result = await db.execute(select(User).where(User.email == account["email"]))
        admin_user = result.scalar_one_or_none()

        if admin_user is None:
            admin_user = User(
                id=str(uuid.uuid4()),
                username=account["username"],
                email=account["email"],
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                created_at=datetime.now(timezone.utc),
            )
            db.add(admin_user)
            await db.flush()
            changed = True
            logger.info("Created default admin account for %s", account["email"])
        else:
            if admin_user.username != account["username"]:
                admin_user.username = account["username"]
                changed = True
            if not password_matches(DEFAULT_ADMIN_PASSWORD, admin_user.password_hash):
                admin_user.password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
                changed = True

        verification_result = await db.execute(
            select(EmailVerification).where(EmailVerification.user_id == admin_user.id).limit(1)
        )
        if verification_result.scalar_one_or_none() is None:
            db.add(EmailVerification(
                id=str(uuid.uuid4()),
                user_id=admin_user.id,
                email=admin_user.email,
                verified_at=datetime.now(timezone.utc),
            ))
            changed = True

    if changed:
        await db.commit()

app = FastAPI()
api_router = APIRouter(prefix="/api")


@app.on_event("startup")
async def startup() -> None:
    # Create tables automatically so a fresh local checkout can boot without manual setup.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        await ensure_default_admin_accounts(db)

# ─── Pydantic Schemas ───

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class AdminRecommendationCreate(BaseModel):
    target_user_id: str
    spotify_track_id: str
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    album_name: Optional[str] = None
    album_image: Optional[str] = None
    duration_ms: Optional[int] = None
    preview_url: Optional[str] = None
    source_type: Optional[str] = None
    score: Optional[float] = None
    note: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    credential: str

class ResendVerificationRequest(BaseModel):
    email: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    avatar_url: Optional[str] = None
    country: Optional[str] = None
    created_at: str

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = True
    cover_url: Optional[str] = None

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    cover_url: Optional[str] = None

class AddSongToPlaylist(BaseModel):
    spotify_track_id: str
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    album_name: Optional[str] = None
    album_image: Optional[str] = None
    duration_ms: Optional[int] = None
    preview_url: Optional[str] = None

class LikeToggle(BaseModel):
    spotify_track_id: str
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    album_name: Optional[str] = None
    album_image: Optional[str] = None
    duration_ms: Optional[int] = None
    preview_url: Optional[str] = None

class RatingSet(BaseModel):
    spotify_track_id: str
    stars: int = Field(ge=1, le=5)
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    album_image: Optional[str] = None

class HistoryLog(BaseModel):
    spotify_track_id: str
    track_name: Optional[str] = None
    artist_name: Optional[str] = None
    genre: Optional[str] = None
    play_duration: int = 0
    skipped: bool = False

class LyraChat(BaseModel):
    message: str


class YouTubeTrackMatch(BaseModel):
    track_name: str
    artist_name: Optional[str] = None


class YouTubeAudioSourceRequest(BaseModel):
    video_id: Optional[str] = None
    track_name: Optional[str] = None
    artist_name: Optional[str] = None


SAMPLE_TRACKS_BY_ID = {track["id"]: track for track in SAMPLE_TRACKS}
SAMPLE_ARTISTS_BY_ID = {artist["id"]: artist for artist in SAMPLE_ARTISTS}

GENRE_KEYWORDS = {
    "hip-hop": ["hip hop", "hip-hop", "rap", "trap", "drill", "desi hip hop"],
    "bollywood": ["bollywood", "arijit", "pritam", "atif", "shreya", "dil", "ishq", "mohabbat"],
    "romantic pop": ["love", "romance", "romantic", "romatic", "dil", "mohabbat", "heart"],
    "dance": ["dance", "party", "club", "remix", "dj", "anthem"],
    "electronic": ["edm", "electronic", "synth", "techno", "house", "cyber", "neon"],
    "lo-fi": ["lofi", "lo-fi", "study", "focus", "beats"],
    "ambient": ["ambient", "sleep", "calm", "meditation", "rain", "waves"],
    "acoustic": ["acoustic", "unplugged", "guitar", "piano"],
    "indie": ["indie", "dream", "midnight", "echoes"],
    "rock": ["rock", "metal", "band", "guitar solo"],
    "devotional": ["bhajan", "mantra", "devotional", "aarti"],
}

MOOD_KEYWORDS = {
    "Energetic": ["dance", "party", "club", "remix", "run", "rush", "anthem", "workout"],
    "Chill": ["chill", "lofi", "lo-fi", "ambient", "study", "soft", "breeze", "rain", "waves"],
    "Melancholic": ["sad", "alone", "cry", "broken", "afterglow", "echoes", "heartbreak"],
    "Romantic": ["love", "romantic", "romatic", "dil", "ishq", "mohabbat", "heart", "serenade"],
    "Happy": ["happy", "sunshine", "golden", "celebration", "smile"],
    "Aggressive": ["trap", "drill", "hard", "rage", "street", "crown"],
    "Focused": ["instrumental", "study", "focus", "piano", "beats"],
    "Calm": ["sleep", "calm", "meditation", "acoustic", "gentle", "tranquility"],
}

GENRE_TO_MOODS = {
    "hip-hop": ["Energetic", "Aggressive"],
    "bollywood": ["Romantic", "Melancholic"],
    "romantic pop": ["Romantic", "Happy"],
    "dance": ["Energetic", "Happy"],
    "electronic": ["Energetic"],
    "lo-fi": ["Chill", "Focused"],
    "ambient": ["Chill", "Calm"],
    "acoustic": ["Calm", "Romantic"],
    "indie": ["Chill", "Melancholic"],
    "rock": ["Energetic", "Aggressive"],
    "devotional": ["Calm"],
}

LYRA_GREETING_KEYWORDS = {"hi", "hello", "hey", "yo", "sup", "hola"}
LYRA_DISCOVERY_KEYWORDS = {
    "play", "suggest", "recommend", "show", "find", "search", "queue", "listen",
    "songs", "song", "music", "tracks", "track", "playlist", "artist", "genre",
    "mood", "vibe", "vibes", "language",
}
LYRA_NON_DISCOVERY_TOKENS = {
    "who", "what", "when", "where", "why", "how", "explain", "help", "about",
    "yourself", "feature", "features", "app", "project",
}
LYRA_QUERY_STOPWORDS = {
    "lyra", "please", "pls", "can", "could", "would", "you", "me", "my", "for",
    "to", "the", "a", "an", "some", "any", "something", "want", "need", "with",
    "show", "give", "find", "search", "suggest", "recommend", "queue", "listen",
    "play", "put", "on", "tell", "send", "let", "hear", "music", "songs", "song",
    "tracks", "track", "playlist", "playlists", "genre", "genres", "mood", "moods",
    "vibe", "vibes", "language", "languages", "artist", "artists", "of", "by",
    "i", "im", "i'm", "am", "feeling", "feel", "today", "now", "right",
}
LYRA_LANGUAGE_KEYWORDS = {
    "Hindi": ["hindi", "bollywood", "desi"],
    "English": ["english", "western", "international"],
    "Punjabi": ["punjabi"],
    "Tamil": ["tamil"],
    "Telugu": ["telugu"],
    "Malayalam": ["malayalam"],
    "Kannada": ["kannada"],
    "Marathi": ["marathi"],
    "Bengali": ["bengali", "bangla"],
    "Gujarati": ["gujarati"],
    "Korean": ["korean", "kpop", "k-pop"],
    "Japanese": ["japanese", "jpop", "j-pop", "anime"],
    "Spanish": ["spanish", "latin", "reggaeton"],
}
LYRA_MOOD_SEARCH_HINTS = {
    "Energetic": "workout energy hits",
    "Chill": "chill lofi calm vibes",
    "Melancholic": "heartbreak emotional songs",
    "Romantic": "romantic love songs",
    "Happy": "feel good happy songs",
    "Aggressive": "hard hitting rap anthems",
    "Focused": "focus study beats",
    "Calm": "calm acoustic soothing songs",
}


def is_hindi_romantic_request(message: str) -> bool:
    text = message.lower()
    romantic_terms = ["romantic", "romatic", "love", "romance", "dil", "ishq", "mohabbat", "pyaar"]
    hindi_terms = ["hindi", "bollywood", "desi"]
    return (
        any(term in text for term in romantic_terms) and any(term in text for term in hindi_terms)
    ) or "hindi romantic" in text or "bollywood romantic" in text


def build_local_lyra_reply(message: str, username: str, suggested_tracks: Optional[List[dict]] = None) -> str:
    text = message.lower()

    if any(keyword in text.split() for keyword in LYRA_GREETING_KEYWORDS):
        return (
            f"Hey {username}, I can line up something chill, romantic, workout, sad, or party-heavy. "
            "Tap one of the song suggestions below or tell me the vibe you want."
        )

    if suggested_tracks:
        summary_items = []
        for track in suggested_tracks[:3]:
            artist_name = ", ".join(
                artist.get("name")
                for artist in (track.get("artists") or [])
                if isinstance(artist, dict) and artist.get("name")
            ) or track.get("artist_name") or "Unknown Artist"
            track_name = track.get("name") or track.get("track_name")
            if track_name:
                summary_items.append(f"{track_name} by {artist_name}")

        if summary_items:
            request_focus = describe_lyra_request(message)
            numbered_recommendations = "\n".join(
                f"{index + 1}. {item}"
                for index, item in enumerate(summary_items)
            )
            return (
                f"Here are a few {request_focus} I'd recommend for you, {username}:\n"
                f"{numbered_recommendations}\n"
                "These are the closest matches I found and they are ready to play with YouTube audio below."
            )

    if is_hindi_romantic_request(message):
        intro = "For a Hindi romantic mood, start with"
        fallback_titles = ["Dil Ki Baarish", "Teri Baatein", "Ishq Wali Raat"]
    elif any(keyword in text for keyword in ["workout", "gym", "run", "energy", "energetic"]):
        intro = "For a workout boost, go with"
        fallback_titles = ["Run the City", "No Sleep", "Cyber Rush"]
    elif any(keyword in text for keyword in ["sad", "melancholic", "cry", "down"]):
        intro = "If you're in a softer, melancholic lane, try"
        fallback_titles = ["Echoes", "Afterglow", "Soft Rain"]
    elif any(keyword in text for keyword in ["chill", "study", "focus", "lofi", "lo-fi"]):
        intro = "For a chill session, I'd start with"
        fallback_titles = ["Ocean Breeze", "Gentle Waves", "Tranquility"]
    elif any(keyword in text for keyword in ["party", "dance", "night out", "club"]):
        intro = "For party energy, queue up"
        fallback_titles = ["Neon Lights", "Electric Soul", "Moonlit Dance"]
    else:
        intro = "Based on your vibe, I'd try"
        fallback_titles = ["Neon Lights", "Velvet Sky", "Dream Catcher"]

    recommendations = []
    if not recommendations:
        for title in fallback_titles:
            track = next((item for item in SAMPLE_TRACKS if item["name"] == title), None)
            if track:
                artist_name = track["artists"][0]["name"]
                recommendations.append(f"{track['name']} by {artist_name}")

    joined = ", ".join(recommendations[:3])
    return f"{intro} {joined}. Want me to turn that into a playlist for you, {username}?"


def is_lyra_greeting(message: str) -> bool:
    normalized = re.sub(r"[^a-z\s]", " ", message.lower()).strip()
    if not normalized:
        return False
    words = normalized.split()
    return len(words) <= 4 and any(word in LYRA_GREETING_KEYWORDS for word in words)


def detect_lyra_moods(message: str) -> List[str]:
    text = message.lower()
    matched = []
    for mood, keywords in MOOD_KEYWORDS.items():
        if mood.lower() in text or any(keyword in text for keyword in keywords):
            matched.append(mood)
    return list(dict.fromkeys(matched))


def detect_lyra_languages(message: str) -> List[str]:
    text = message.lower()
    matched = []
    for language, keywords in LYRA_LANGUAGE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            matched.append(language)
    return list(dict.fromkeys(matched))


def detect_lyra_genres(message: str) -> List[str]:
    text = message.lower()
    matched = []
    for genre, keywords in GENRE_KEYWORDS.items():
        if genre.lower() in text or any(keyword in text for keyword in keywords):
            matched.append(genre)
    return list(dict.fromkeys(matched))


def looks_like_named_music_request(message: str) -> bool:
    cleaned = clean_lyra_search_text(message)
    tokens = cleaned.split()
    if not tokens or len(tokens) > 4:
        return False
    if any(token in LYRA_NON_DISCOVERY_TOKENS for token in tokens):
        return False
    return True


def describe_lyra_request(message: str) -> str:
    languages = detect_lyra_languages(message)
    genres = detect_lyra_genres(message)
    moods = detect_lyra_moods(message)
    cleaned = clean_lyra_search_text(message).strip()

    if is_hindi_romantic_request(message):
        return "Hindi romantic songs"

    lowered = message.lower()
    if (
        cleaned
        and len(cleaned.split()) <= 4
        and not any(keyword in lowered for keyword in LYRA_DISCOVERY_KEYWORDS)
    ):
        return f"{cleaned} songs"

    parts = []
    parts.extend(language for language in languages[:1])
    parts.extend(mood.lower() for mood in moods[:1])

    if genres:
        genre_label = genres[0]
        genre_words = [
            word
            for word in re.findall(r"[a-z0-9]+", genre_label.lower())
            if word not in {mood.lower() for mood in moods}
        ]
        if genre_words:
            parts.append(" ".join(genre_words))

    if parts:
        return " ".join(parts) + " songs"

    if cleaned:
        if re.search(r"\b(song|songs|music|track|tracks)\b", cleaned):
            return cleaned
        return f"{cleaned} songs"

    return "song"


def is_lyra_discovery_request(message: str) -> bool:
    text = message.lower()
    if is_lyra_greeting(message):
        return True
    if detect_lyra_languages(message) or detect_lyra_genres(message) or detect_lyra_moods(message):
        return True
    if looks_like_named_music_request(message):
        return True
    return any(keyword in text for keyword in LYRA_DISCOVERY_KEYWORDS)


def clean_lyra_search_text(message: str) -> str:
    normalized = re.sub(r"[^a-z0-9\s&'+-]", " ", message.lower())
    tokens = [
        token
        for token in normalized.split()
        if token and token not in LYRA_QUERY_STOPWORDS
    ]
    return " ".join(tokens)


def dedupe_query_terms(items: List[str]) -> List[str]:
    deduped = []
    seen = set()
    for item in items:
        cleaned = (item or "").strip()
        if not cleaned:
            continue
        normalized = re.sub(r"[^a-z0-9]+", "", cleaned.lower())
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(cleaned)
    return deduped


def build_lyra_search_queries(message: str, taste_profile: Optional[dict]) -> List[str]:
    text = message.lower()
    languages = detect_lyra_languages(message)
    genres = detect_lyra_genres(message)
    moods = detect_lyra_moods(message)
    cleaned = clean_lyra_search_text(message)
    mood_tokens = {token.lower() for token in moods}
    descriptor_terms = []
    descriptor_terms.extend(language.lower() for language in languages[:2])
    for genre in genres[:2]:
        genre_words = [word for word in re.findall(r"[a-z0-9]+", genre.lower()) if word not in mood_tokens]
        descriptor_terms.append(" ".join(genre_words) if genre_words else genre.lower())
    descriptor_terms.extend(mood.lower() for mood in moods[:2])
    queries: List[str] = []

    if is_lyra_greeting(message):
        if taste_profile and taste_profile.get("has_data"):
            base_terms = []
            base_terms.extend(taste_profile.get("top_artists", [])[:2])
            base_terms.extend(taste_profile.get("top_genres", [])[:2])
            base_terms.extend(taste_profile.get("top_moods", [])[:1])
            queries.append(" ".join(term for term in base_terms if term))
        queries.extend([
            "feel good songs",
            "hindi english feel good songs",
        ])
        return dedupe_query_terms(queries)

    if cleaned:
        base_query = cleaned if re.search(r"\b(song|songs|music|track|tracks)\b", cleaned) else f"{cleaned} songs"
        queries.append(base_query)

    if descriptor_terms:
        descriptor_query = " ".join(dedupe_query_terms([
            *cleaned.split(),
            *descriptor_terms,
            "songs",
        ]))
        queries.append(descriptor_query)

    if moods:
        queries.extend(
            f"{language.lower()} {LYRA_MOOD_SEARCH_HINTS.get(mood, mood).lower()}"
            for language in languages[:1]
            for mood in moods[:1]
        )
        queries.extend(
            LYRA_MOOD_SEARCH_HINTS.get(mood, mood).lower()
            for mood in moods[:2]
        )

    if taste_profile and taste_profile.get("has_data") and not descriptor_terms:
        personal_terms = []
        personal_terms.extend(taste_profile.get("top_artists", [])[:1])
        personal_terms.extend(taste_profile.get("top_genres", [])[:2])
        personal_terms.extend(taste_profile.get("top_moods", [])[:1])
        if personal_terms:
            queries.append(" ".join(personal_terms))

    if not queries and languages:
        queries.append(f"{languages[0].lower()} songs")
    if not queries and genres:
        queries.append(f"{genres[0].lower()} songs")
    if not queries and moods:
        queries.append(f"{moods[0].lower()} songs")
    if not queries:
        queries.append(message.strip())

    return dedupe_query_terms(queries)


async def build_lyra_track_suggestions(message: str, user_id: str, db: AsyncSession, limit: int = 6) -> List[dict]:
    taste_profile = await build_user_taste_profile(user_id, db)
    if not is_lyra_discovery_request(message):
        return []

    queries = build_lyra_search_queries(message, taste_profile)

    youtube_tracks = await collect_youtube_track_candidates(queries, per_query=max(limit, 5))
    if youtube_tracks:
        if is_lyra_greeting(message):
            return rank_tracks_for_user(youtube_tracks, taste_profile, limit)
        return youtube_tracks[:limit]

    if sp:
        try:
            spotify_candidates = collect_track_candidates(queries, per_query=max(limit, 5))
            if spotify_candidates:
                if is_lyra_greeting(message):
                    return rank_tracks_for_user(spotify_candidates, taste_profile, limit)
                return spotify_candidates[:limit]
        except Exception as exc:
            logger.warning(f"LYRA suggestion search fallback: {exc}")

    fallback_results = search_sample_data(" ".join(queries), "track", limit)
    sample_tracks = fallback_results.get("tracks", {}).get("items", []) if isinstance(fallback_results, dict) else []
    if sample_tracks:
        if is_lyra_greeting(message):
            return rank_tracks_for_user(sample_tracks, taste_profile, limit)
        return sample_tracks[:limit]

    return rank_tracks_for_user(SAMPLE_TRACKS, taste_profile, limit)


def add_weighted_score(bucket: dict, key: Optional[str], weight: float) -> None:
    if not key:
        return
    bucket[key] = round(bucket.get(key, 0) + weight, 4)


def infer_track_profile(track_id: Optional[str], track_name: Optional[str], artist_name: Optional[str]) -> dict:
    genres = []
    moods = []
    resolved_artist = artist_name or "Unknown"
    sample_track = SAMPLE_TRACKS_BY_ID.get(track_id or "")

    if sample_track:
        sample_artist = sample_track.get("artists", [{}])[0]
        resolved_artist = sample_artist.get("name") or resolved_artist
        sample_artist_info = SAMPLE_ARTISTS_BY_ID.get(sample_artist.get("id"))
        if sample_artist_info:
            genres.extend(sample_artist_info.get("genres", []))

    text = f"{track_name or ''} {artist_name or resolved_artist}".lower()

    for genre, keywords in GENRE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            genres.append(genre)

    for mood, keywords in MOOD_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            moods.append(mood)

    for genre in genres:
        for mood in GENRE_TO_MOODS.get(genre, []):
            moods.append(mood)

    normalized_genres = list(dict.fromkeys([genre for genre in genres if genre]))
    normalized_moods = list(dict.fromkeys([mood for mood in moods if mood]))

    if not normalized_genres:
        normalized_genres = ["eclectic"]
    if not normalized_moods:
        normalized_moods = ["Balanced"]

    return {
        "artist_name": resolved_artist,
        "genres": normalized_genres,
        "moods": normalized_moods,
    }


def history_weight(entry: ListeningHistory) -> float:
    played_seconds = max(entry.play_duration or 0, 0)
    if entry.skipped:
        return min(max(played_seconds / 60, 0.15), 0.75)
    if played_seconds <= 0:
        return 0.25
    return min(max(played_seconds / 30, 0.5), 3.5)


def apply_taste_profile(likes: List[Like], ratings: List[Rating], history: List[ListeningHistory]) -> dict:
    genre_counts = {}
    mood_scores = {}
    artist_counts = {}

    for like in likes:
        profile = infer_track_profile(like.spotify_track_id, like.track_name, like.artist_name)
        weight = 3.0
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    for rating in ratings:
        profile = infer_track_profile(rating.spotify_track_id, rating.track_name, rating.artist_name)
        weight = 1.5 + (rating.stars * 0.7)
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    for entry in history:
        profile = infer_track_profile(entry.spotify_track_id, entry.track_name, entry.artist_name)
        weight = history_weight(entry)
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    return {
        "genre_counts": genre_counts,
        "mood_scores": mood_scores,
        "artist_counts": artist_counts,
    }


async def build_user_taste_profile(user_id: str, db: AsyncSession) -> dict:
    likes_result = await db.execute(select(Like).where(Like.user_id == user_id))
    ratings_result = await db.execute(select(Rating).where(Rating.user_id == user_id))
    history_result = await db.execute(
        select(ListeningHistory).where(ListeningHistory.user_id == user_id).order_by(ListeningHistory.played_at.desc()).limit(300)
    )

    likes = likes_result.scalars().all()
    ratings = ratings_result.scalars().all()
    history = history_result.scalars().all()
    weighted = apply_taste_profile(likes, ratings, history)

    top_genres = [name for name, _ in sorted(weighted["genre_counts"].items(), key=lambda item: -item[1])[:5]]
    top_moods = [name for name, _ in sorted(weighted["mood_scores"].items(), key=lambda item: -item[1])[:5]]
    top_artists = [name for name, _ in sorted(weighted["artist_counts"].items(), key=lambda item: -item[1])[:5]]

    return {
        **weighted,
        "top_genres": top_genres,
        "top_moods": top_moods,
        "top_artists": top_artists,
        "has_data": bool(likes or ratings or history),
    }


async def get_optional_user(authorization: Optional[str], db: AsyncSession) -> Optional[User]:
    if not authorization:
        return None
    try:
        return await get_current_user(authorization, db)
    except HTTPException:
        return None


def score_track_against_taste(track: dict, taste_profile: Optional[dict], period: Optional[str] = None) -> float:
    score = (track.get("popularity", 0) or 0) / 100
    profile = infer_track_profile(
        track.get("id"),
        track.get("name") or track.get("track_name"),
        track.get("artists", [{}])[0].get("name") if track.get("artists") else track.get("artist_name"),
    )
    artist_name = profile["artist_name"]

    if not taste_profile or not taste_profile.get("has_data"):
        return score

    if artist_name in taste_profile["top_artists"]:
        score += 4 - taste_profile["top_artists"].index(artist_name) * 0.6

    for genre in profile["genres"]:
        if genre in taste_profile["top_genres"]:
            score += 2.3 - taste_profile["top_genres"].index(genre) * 0.3

    for mood in profile["moods"]:
        if mood in taste_profile["top_moods"]:
            score += 1.8 - taste_profile["top_moods"].index(mood) * 0.2

    if period:
        period_tracks = {item["id"] for item in get_sample_tracks_for_period(period)}
        if track.get("id") in period_tracks:
            score += 1.5

    return score


def rank_tracks_for_user(candidates: List[dict], taste_profile: Optional[dict], limit: int, period: Optional[str] = None) -> List[dict]:
    unique_tracks = []
    seen = set()
    for track in candidates:
        track_id = track.get("id")
        if not track_id or track_id in seen:
            continue
        seen.add(track_id)
        unique_tracks.append(track)

    ranked = sorted(
        unique_tracks,
        key=lambda track: score_track_against_taste(track, taste_profile, period),
        reverse=True,
    )
    return ranked[:limit]


def rank_albums_for_user(albums: List[dict], taste_profile: Optional[dict], limit: int) -> List[dict]:
    if not taste_profile or not taste_profile.get("has_data"):
        return albums[:limit]

    def album_score(album: dict) -> float:
        score = 0.0
        artist = (album.get("artists") or [{}])[0]
        artist_name = artist.get("name")
        artist_id = artist.get("id")
        if artist_name in taste_profile["top_artists"]:
            score += 5 - taste_profile["top_artists"].index(artist_name) * 0.7

        artist_info = SAMPLE_ARTISTS_BY_ID.get(artist_id)
        if artist_info:
            for genre in artist_info.get("genres", []):
                if genre in taste_profile["top_genres"]:
                    score += 2.0 - taste_profile["top_genres"].index(genre) * 0.25

        release_date = album.get("release_date") or ""
        if release_date:
            try:
                release_year = int(release_date.split("-")[0])
                score += max(min((release_year - 2023) * 0.5, 2.5), 0)
            except ValueError:
                pass
        return score

    return sorted(albums, key=album_score, reverse=True)[:limit]


async def search_youtube_video(track_name: str, artist_name: Optional[str] = None) -> Optional[dict]:
    return await asyncio.to_thread(_search_youtube_video_sync, track_name, artist_name)


async def get_youtube_audio_source(video_id: str) -> Optional[dict]:
    return await asyncio.to_thread(_get_youtube_audio_source_sync, video_id)


async def search_youtube_tracks(query: str, limit: int = 20) -> List[dict]:
    return await asyncio.to_thread(_search_youtube_tracks_sync, query, limit)


def _pick_best_audio_format(info: dict) -> Optional[dict]:
    formats = info.get("formats") or []
    audio_formats = [
        fmt for fmt in formats
        if fmt.get("acodec") not in (None, "none") and fmt.get("vcodec") == "none" and fmt.get("url")
    ]
    audio_formats.sort(
        key=lambda fmt: (
            fmt.get("abr") or 0,
            fmt.get("asr") or 0,
            fmt.get("filesize") or 0,
        ),
        reverse=True,
    )
    return audio_formats[0] if audio_formats else None


def _youtube_entry_to_track(entry: dict) -> Optional[dict]:
    video_id = entry.get("id") or entry.get("url")
    if not video_id:
        return None

    title = entry.get("title") or "Unknown Title"
    artist_name = entry.get("channel") or entry.get("uploader") or "YouTube"
    thumbnail = entry.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    duration = entry.get("duration")
    duration_ms = int(duration * 1000) if duration else None
    artist_slug = re.sub(r"[^a-z0-9]+", "_", artist_name.lower()).strip("_") or "youtube"

    return {
        "id": f"yt_{video_id}",
        "name": title,
        "artists": [{"id": f"yt_artist_{artist_slug}", "name": artist_name}],
        "album": {
            "id": f"yt_album_{video_id}",
            "name": "YouTube Audio",
            "images": [{"url": thumbnail}],
            "release_date": "",
        },
        "duration_ms": duration_ms,
        "preview_url": None,
        "popularity": entry.get("view_count", 0),
        "explicit": False,
        "type": "track",
        "youtube_video_id": video_id,
        "youtube_title": title,
        "youtube_watch_url": f"https://www.youtube.com/watch?v={video_id}",
        "youtube_embed_url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&enablejsapi=1",
    }


def _search_youtube_tracks_sync(query: str, limit: int = 20) -> List[dict]:
    if not YoutubeDL:
        return []

    cache_key = (query.strip().lower(), max(1, min(limit, 25)))
    now = time.time()
    cached_entry = youtube_catalog_cache.get(cache_key)
    if cached_entry and cached_entry["expires_at"] > now:
        return cached_entry["value"]

    options = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "socket_timeout": 12,
    }

    search_term = f"ytsearch{cache_key[1]}:{query} official audio"

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(search_term, download=False)
    except Exception as exc:
        logger.warning(f"YouTube catalog search failed for '{query}': {exc}")
        return []

    entries = info.get("entries") or []
    tracks = [track for track in (_youtube_entry_to_track(entry) for entry in entries) if track]
    youtube_catalog_cache[cache_key] = {
        "value": tracks,
        "expires_at": now + (60 * 15),
    }
    return tracks


def _get_youtube_audio_source_sync(video_id: str) -> Optional[dict]:
    if not YoutubeDL:
        logger.warning("yt-dlp is not installed; YouTube audio extraction unavailable.")
        return None

    now = time.time()
    cached_entry = youtube_audio_cache.get(video_id)
    if cached_entry and cached_entry["expires_at"] > now:
        return cached_entry["value"]

    url = f"https://www.youtube.com/watch?v={video_id}"
    options = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extract_flat": False,
        "skip_download": True,
        "socket_timeout": 15,
    }

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        logger.warning(f"YouTube audio extraction failed for {video_id}: {exc}")
        return None

    best_audio = _pick_best_audio_format(info)
    audio_url = (
        info.get("url")
        if info.get("acodec") not in (None, "none") and info.get("vcodec") == "none" and info.get("url")
        else best_audio.get("url") if best_audio else None
    )

    if not audio_url:
        return None

    result = {
        "video_id": video_id,
        "stream_url": audio_url,
        "title": info.get("title"),
        "duration": info.get("duration"),
        "thumbnail_url": info.get("thumbnail"),
        "watch_url": info.get("webpage_url") or url,
        "resolved_via": "yt_dlp_audio",
    }
    youtube_audio_cache[video_id] = {
        "value": result,
        "expires_at": now + YOUTUBE_AUDIO_CACHE_TTL,
    }
    return result


def _search_youtube_video_sync(track_name: str, artist_name: Optional[str] = None) -> Optional[dict]:
    global youtube_data_api_available

    query_parts = [track_name, artist_name, "official audio"]
    query = " ".join(part for part in query_parts if part)
    cache_key = (track_name.strip().lower(), (artist_name or "").strip().lower())
    now = time.time()
    cached_entry = youtube_search_cache.get(cache_key)
    if cached_entry and cached_entry["expires_at"] > now:
        return cached_entry["value"]

    if YOUTUBE_API_KEY and youtube_data_api_available:
        params = urllib_parse.urlencode({
            "part": "snippet",
            "q": query,
            "type": "video",
            "videoCategoryId": "10",
            "maxResults": 1,
            "key": YOUTUBE_API_KEY,
        })

        try:
            url = f"https://www.googleapis.com/youtube/v3/search?{params}"
            with urllib_request.urlopen(url, timeout=10) as response:
                payload = json.loads(response.read().decode())
            items = payload.get("items", [])
            if items:
                item = items[0]
                video_id = item.get("id", {}).get("videoId")
                if video_id:
                    snippet = item.get("snippet", {})
                    thumbnails = snippet.get("thumbnails", {})
                    thumbnail = thumbnails.get("high") or thumbnails.get("medium") or thumbnails.get("default") or {}
                    result = {
                        "video_id": video_id,
                        "title": snippet.get("title"),
                        "channel_title": snippet.get("channelTitle"),
                        "thumbnail_url": thumbnail.get("url"),
                        "embed_url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&enablejsapi=1",
                        "watch_url": f"https://www.youtube.com/watch?v={video_id}",
                        "resolved_via": "youtube_data_api",
                    }
                    youtube_search_cache[cache_key] = {
                        "value": result,
                        "expires_at": now + YOUTUBE_SEARCH_CACHE_TTL,
                    }
                    return result
        except Exception as exc:
            logger.warning(f"YouTube Data API search failed, trying page fallback: {exc}")
            if "HTTP Error 403" in str(exc):
                youtube_data_api_available = False

    try:
        search_query = urllib_parse.urlencode({"search_query": query})
        url = f"https://www.youtube.com/results?{search_query}"
        request = urllib_request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib_request.urlopen(request, timeout=10) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.warning(f"YouTube page search failed: {exc}")
        return None

    matches = re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', html)
    unique_ids = []
    for match in matches:
        if match not in unique_ids:
            unique_ids.append(match)

    if not unique_ids:
        return None

    video_id = unique_ids[0]
    result = {
        "video_id": video_id,
        "title": f"{track_name} - {artist_name}".strip(" -"),
        "channel_title": "YouTube",
        "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "embed_url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&enablejsapi=1",
        "watch_url": f"https://www.youtube.com/watch?v={video_id}",
        "resolved_via": "youtube_page_search",
    }
    youtube_search_cache[cache_key] = {
        "value": result,
        "expires_at": now + YOUTUBE_SEARCH_CACHE_TTL,
    }
    return result

# ─── Auth Helpers ───

def create_token(user_id: str, username: str) -> str:
    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.now(timezone.utc).timestamp() + 86400 * 7
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def is_email_verified(user_id: str, db: AsyncSession) -> bool:
    result = await db.execute(select(EmailVerification).where(EmailVerification.user_id == user_id))
    return result.scalar_one_or_none() is not None


async def ensure_verified_email(user: User, db: AsyncSession) -> None:
    if await is_email_verified(user.id, db):
        return
    db.add(EmailVerification(
        id=str(uuid.uuid4()),
        user_id=user.id,
        email=user.email,
        verified_at=datetime.now(timezone.utc),
    ))
    await db.commit()


async def build_user_payload(user: User, db: AsyncSession) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "country": user.country,
        "created_at": user.created_at.isoformat(),
        "email_verified": await is_email_verified(user.id, db),
        "is_admin": is_admin_user(user),
    }


async def sync_supabase_user_profile(db: AsyncSession, profile: dict) -> User:
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Supabase profile did not include an email")

    result = await db.execute(select(User).where(User.email.ilike(email)))
    user = result.scalar_one_or_none()
    if user:
        return user

    metadata = profile.get("user_metadata") or {}
    display_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or profile.get("user_metadata", {}).get("name")
        or email.split("@")[0]
    )
    username = await generate_unique_username(str(display_name).replace(" ", "_").lower(), db)
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        password_hash=hash_password(uuid.uuid4().hex),
        avatar_url=metadata.get("avatar_url") or profile.get("avatar_url"),
    )
    db.add(user)
    await db.flush()
    return user


def serialize_like(like: Like) -> dict:
    return {
        "spotify_track_id": like.spotify_track_id,
        "track_name": like.track_name,
        "artist_name": like.artist_name,
        "album_name": like.album_name,
        "album_image": like.album_image,
        "duration_ms": like.duration_ms,
        "preview_url": like.preview_url,
        "liked_at": like.liked_at.isoformat() if like.liked_at else None,
    }


def serialize_history_entry(entry: ListeningHistory) -> dict:
    return {
        "spotify_track_id": entry.spotify_track_id,
        "track_name": entry.track_name,
        "artist_name": entry.artist_name,
        "album_name": None,
        "album_image": None,
        "duration_ms": None,
        "preview_url": None,
        "played_at": entry.played_at.isoformat() if entry.played_at else None,
        "genre": entry.genre,
        "skipped": entry.skipped,
    }


def serialize_admin_recommendation(
    recommendation: AdminRecommendation,
    admin_user: Optional[User] = None,
    target_user: Optional[User] = None,
) -> dict:
    return {
        "id": recommendation.id,
        "admin_user_id": recommendation.admin_user_id,
        "admin_username": admin_user.username if admin_user else None,
        "admin_email": admin_user.email if admin_user else None,
        "target_user_id": recommendation.target_user_id,
        "target_username": target_user.username if target_user else None,
        "target_email": target_user.email if target_user else None,
        "spotify_track_id": recommendation.spotify_track_id,
        "track_name": recommendation.track_name,
        "artist_name": recommendation.artist_name,
        "album_name": recommendation.album_name,
        "album_image": recommendation.album_image,
        "duration_ms": recommendation.duration_ms,
        "preview_url": recommendation.preview_url,
        "source_type": recommendation.source_type,
        "score": recommendation.score,
        "note": recommendation.note,
        "recommended_at": recommendation.recommended_at.isoformat() if recommendation.recommended_at else None,
    }


def dedupe_tracks(tracks: List[dict]) -> List[dict]:
    unique_tracks = []
    seen_ids = set()

    for track in tracks or []:
        track_id = track.get("id")
        if not track_id or track_id in seen_ids:
            continue
        seen_ids.add(track_id)
        unique_tracks.append(track)

    return unique_tracks


def build_database_label() -> dict:
    database_url = DATABASE_URL or ""
    if database_url.startswith("postgresql"):
        backend = "PostgreSQL"
    elif database_url.startswith("sqlite"):
        backend = "SQLite"
    else:
        backend = "Unknown"

    return {
        "backend": backend,
        "database_url": database_url,
        "is_supabase_database": "supabase.co" in database_url,
    }


async def collect_youtube_track_candidates(queries: List[str], per_query: int = 8) -> List[dict]:
    normalized_queries = []
    seen_queries = set()

    for query in queries or []:
        cleaned = (query or "").strip()
        lowered = cleaned.lower()
        if not cleaned or lowered in seen_queries:
            continue
        seen_queries.add(lowered)
        normalized_queries.append(cleaned)

    if not normalized_queries:
        return []

    results = await asyncio.gather(
        *(search_youtube_tracks(query, per_query) for query in normalized_queries),
        return_exceptions=True,
    )

    tracks: List[dict] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        tracks.extend(result or [])

    return dedupe_tracks(tracks)


def parse_release_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def score_release_freshness(release_date: Optional[str]) -> float:
    parsed_release_date = parse_release_date(release_date)
    if not parsed_release_date:
        return 0.0

    age_days = max((datetime.now(timezone.utc) - parsed_release_date).days, 0)
    if age_days <= 14:
        return 5.0
    if age_days <= 45:
        return 4.0
    if age_days <= 90:
        return 3.0
    if age_days <= 180:
        return 1.8
    if age_days <= 365:
        return 0.9
    return 0.2


def serialize_track_candidate(
    track: dict,
    score: float,
    source_type: str,
    recommended_by: Optional[List[str]] = None,
    reason: Optional[str] = None,
) -> dict:
    album = track.get("album") if isinstance(track.get("album"), dict) else {}
    images = album.get("images") if isinstance(album.get("images"), list) else []
    primary_image = images[0].get("url") if images and isinstance(images[0], dict) else track.get("album_image")
    artist_names = [
        artist.get("name")
        for artist in (track.get("artists") or [])
        if isinstance(artist, dict) and artist.get("name")
    ]

    return {
        "spotify_track_id": track.get("id") or track.get("spotify_track_id"),
        "track_name": track.get("name") or track.get("track_name"),
        "artist_name": ", ".join(artist_names) or track.get("artist_name"),
        "album_name": album.get("name") or track.get("album_name"),
        "album_image": primary_image,
        "duration_ms": track.get("duration_ms"),
        "preview_url": track.get("preview_url"),
        "recommended_by": recommended_by or [],
        "score": round(score, 2),
        "source_type": source_type,
        "reason": reason,
    }


def build_track_reason(track: dict, taste_profile: Optional[dict], fallback: str) -> str:
    profile = infer_track_profile(
        track.get("id"),
        track.get("name") or track.get("track_name"),
        track.get("artists", [{}])[0].get("name") if track.get("artists") else track.get("artist_name"),
    )

    reasons = []
    if taste_profile and taste_profile.get("has_data"):
        if profile["artist_name"] in taste_profile.get("top_artists", []):
            reasons.append(f"Matches {profile['artist_name']}")

        shared_genres = [genre for genre in profile["genres"] if genre in taste_profile.get("top_genres", [])]
        if shared_genres:
            reasons.append(f"{shared_genres[0].title()} vibe")

    return " | ".join(reasons[:2]) or fallback


def collect_track_candidates(queries: List[str], per_query: int = 8) -> List[dict]:
    normalized_queries = []
    seen_queries = set()

    for query in queries:
        cleaned = " ".join((query or "").split()).strip()
        lowered = cleaned.lower()
        if not cleaned or lowered in seen_queries:
            continue
        seen_queries.add(lowered)
        normalized_queries.append(cleaned)

    candidates: List[dict] = []

    if sp:
        for query in normalized_queries:
            try:
                results = sp.search(q=query, type="track", limit=per_query)
                candidates.extend(results.get("tracks", {}).get("items", []))
            except Exception as exc:
                logger.warning(f"Track candidate lookup failed for '{query}': {exc}")

    if not candidates:
        for query in normalized_queries:
            sample_results = search_sample_data(query, "track", per_query)
            if isinstance(sample_results, dict):
                candidates.extend(sample_results.get("tracks", {}).get("items", []))

    return dedupe_tracks(candidates)


def collect_related_artist_tracks(top_artists: List[str], per_artist: int = 3) -> List[dict]:
    if not sp:
        return []

    candidates: List[dict] = []
    for artist_name in top_artists[:2]:
        try:
            artist_results = sp.search(q=f'artist:"{artist_name}"', type="artist", limit=1)
            artist_items = artist_results.get("artists", {}).get("items", [])
            if not artist_items:
                continue

            related_artists = sp.artist_related_artists(artist_items[0]["id"]).get("artists", [])[:4]
            for related_artist in related_artists:
                try:
                    top_tracks = sp.artist_top_tracks(related_artist["id"], country="US").get("tracks", [])
                    candidates.extend(top_tracks[:per_artist])
                except Exception as exc:
                    logger.warning(f"Related artist top-track lookup failed for '{related_artist.get('name', 'unknown')}': {exc}")
        except Exception as exc:
            logger.warning(f"Related artist lookup failed for '{artist_name}': {exc}")

    return dedupe_tracks(candidates)


async def build_collaborative_recommendations(target_user_id: str, db: AsyncSession, limit: int = 10) -> dict:
    target_user_result = await db.execute(select(User).where(User.id == target_user_id))
    target_user = target_user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_likes_result = await db.execute(select(Like).where(Like.user_id == target_user_id))
    target_likes = target_likes_result.scalars().all()
    target_track_ids = {like.spotify_track_id for like in target_likes}
    target_taste_profile = await build_user_taste_profile(target_user_id, db)

    existing_recommendations_result = await db.execute(
        select(AdminRecommendation.spotify_track_id).where(AdminRecommendation.target_user_id == target_user_id)
    )
    existing_track_ids = {row[0] for row in existing_recommendations_result.all()}

    likes_result = await db.execute(select(Like, User).join(User, User.id == Like.user_id))
    like_rows = likes_result.all()
    history_result = await db.execute(select(ListeningHistory, User).join(User, User.id == ListeningHistory.user_id))
    history_rows = history_result.all()

    likes_by_user: dict[str, list[Like]] = {}
    history_by_user: dict[str, list[ListeningHistory]] = {}
    user_lookup: dict[str, User] = {}
    for like, source_user in like_rows:
        likes_by_user.setdefault(source_user.id, []).append(like)
        user_lookup[source_user.id] = source_user
    for history_entry, source_user in history_rows:
        history_by_user.setdefault(source_user.id, []).append(history_entry)
        user_lookup[source_user.id] = source_user

    listener_matches: dict[str, dict] = {}
    user_ids = set(likes_by_user) | set(history_by_user)
    excluded_track_ids = set(target_track_ids) | existing_track_ids

    for other_user_id in user_ids:
        if other_user_id == target_user_id:
            continue

        other_likes = likes_by_user.get(other_user_id, [])
        other_history = history_by_user.get(other_user_id, [])
        if not other_likes and not other_history:
            continue

        other_taste_profile = {
            **apply_taste_profile(other_likes, [], other_history),
        }
        other_taste_profile["top_genres"] = [
            name for name, _ in sorted(other_taste_profile["genre_counts"].items(), key=lambda item: -item[1])[:5]
        ]
        other_taste_profile["top_moods"] = [
            name for name, _ in sorted(other_taste_profile["mood_scores"].items(), key=lambda item: -item[1])[:5]
        ]
        other_taste_profile["top_artists"] = [
            name for name, _ in sorted(other_taste_profile["artist_counts"].items(), key=lambda item: -item[1])[:5]
        ]
        other_taste_profile["has_data"] = bool(other_likes or other_history)

        exact_overlap = len(target_track_ids & {like.spotify_track_id for like in other_likes})
        shared_artists = set(target_taste_profile.get("top_artists", [])) & set(other_taste_profile.get("top_artists", []))
        shared_genres = set(target_taste_profile.get("top_genres", [])) & set(other_taste_profile.get("top_genres", []))
        shared_moods = set(target_taste_profile.get("top_moods", [])) & set(other_taste_profile.get("top_moods", []))
        similarity_score = (
            exact_overlap * 4
            + len(shared_artists) * 2.5
            + len(shared_genres) * 1.5
            + len(shared_moods) * 1.0
        )

        if similarity_score <= 0:
            continue

        source_user = user_lookup.get(other_user_id)
        source_label = source_user.username if source_user else other_user_id
        match_reasons = []
        if exact_overlap:
            match_reasons.append(f"{exact_overlap} shared likes")
        if shared_artists:
            match_reasons.append(f"shared artists: {', '.join(sorted(shared_artists)[:2])}")
        elif shared_genres:
            match_reasons.append(f"shared genres: {', '.join(sorted(shared_genres)[:2])}")
        elif shared_moods:
            match_reasons.append(f"shared moods: {', '.join(sorted(shared_moods)[:2])}")
        match_reason = " | ".join(match_reasons) or "Picked from similar listeners"

        source_tracks = [serialize_like(like) for like in other_likes]
        seen_source_track_ids = {track["spotify_track_id"] for track in source_tracks}
        for history_entry in other_history:
            if history_entry.skipped or not history_entry.spotify_track_id:
                continue
            if history_entry.spotify_track_id in seen_source_track_ids:
                continue
            seen_source_track_ids.add(history_entry.spotify_track_id)
            source_tracks.append(serialize_history_entry(history_entry))

        for track in source_tracks:
            track_id = track.get("spotify_track_id")
            if not track_id or track_id in excluded_track_ids:
                continue

            entry = listener_matches.setdefault(
                track_id,
                {
                    **track,
                    "recommended_by": [],
                    "score": 0.0,
                    "source_type": "collaborative_filter",
                    "reason": match_reason,
                },
            )
            if source_label not in entry["recommended_by"]:
                entry["recommended_by"].append(source_label)
            entry["score"] += similarity_score

    sorted_listener_matches = sorted(
        listener_matches.values(),
        key=lambda recommendation: (-recommendation["score"], recommendation["track_name"] or ""),
    )[:limit]

    taste_profile = target_taste_profile

    artist_queries = []
    for artist_name in taste_profile.get("top_artists", [])[:3]:
        artist_queries.extend([
            f'artist:"{artist_name}"',
            f"{artist_name} similar vibes",
        ])
    for genre in taste_profile.get("top_genres", [])[:2]:
        artist_queries.append(f"{genre} artist mix")

    if not artist_queries and taste_profile.get("top_moods"):
        artist_queries.extend(f"{mood} songs" for mood in taste_profile["top_moods"][:2])

    artist_candidates = dedupe_tracks(
        collect_related_artist_tracks(taste_profile.get("top_artists", [])) +
        collect_track_candidates(artist_queries, per_query=max(limit, 6))
    )

    if not artist_candidates:
        artist_candidates = rank_tracks_for_user(SAMPLE_TRACKS, taste_profile, max(limit * 2, 12))

    filtered_artist_candidates = [
        track
        for track in artist_candidates
        if track.get("id") and track.get("id") not in excluded_track_ids
    ]

    sorted_artist_candidates = sorted(
        filtered_artist_candidates,
        key=lambda track: (
            score_track_against_taste(track, taste_profile) +
            score_release_freshness((track.get("album") or {}).get("release_date"))
        ),
        reverse=True,
    )

    similar_artist_tracks = [
        serialize_track_candidate(
            track,
            score_track_against_taste(track, taste_profile) + score_release_freshness((track.get("album") or {}).get("release_date")),
            "similar_artist",
            reason=build_track_reason(track, taste_profile, "Similar artist match"),
        )
        for track in sorted_artist_candidates[:limit]
    ]

    combined_recommendations = list(sorted_listener_matches)
    seen_track_ids = {item["spotify_track_id"] for item in combined_recommendations}
    for recommendation in similar_artist_tracks:
        if recommendation["spotify_track_id"] in seen_track_ids:
            continue
        seen_track_ids.add(recommendation["spotify_track_id"])
        combined_recommendations.append(recommendation)

    return {
        "listener_matches": sorted_listener_matches,
        "similar_artist_tracks": similar_artist_tracks,
        "recommendations": combined_recommendations[:limit * 2],
    }


async def generate_unique_username(base_username: str, db: AsyncSession) -> str:
    seed = re.sub(r"[^a-zA-Z0-9_]+", "_", base_username).strip("_") or "rhythmiq_user"
    candidate = seed[:30]
    suffix = 1

    while True:
        result = await db.execute(select(User).where(User.username == candidate))
        if not result.scalar_one_or_none():
            return candidate
        suffix += 1
        candidate = f"{seed[:24]}_{suffix}"


def send_brevo_email(to_email: str, subject: str, html_content: str) -> bool:
    if not BREVO_API_KEY or not BREVO_SENDER_EMAIL:
        logger.warning("Brevo email not sent because BREVO_API_KEY or BREVO_SENDER_EMAIL is missing.")
        return False

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept": "application/json",
                "api-key": BREVO_API_KEY,
                "content-type": "application/json",
            },
            json={
                "sender": {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_content,
            },
            timeout=15,
        )
        response.raise_for_status()
        return True
    except Exception as exc:
        logger.error(f"Brevo email send failed: {exc}")
        return False


def get_month_period_key(value: Optional[datetime] = None) -> str:
    current = value or datetime.now(timezone.utc)
    return current.strftime("%Y-%m")


def get_month_period_start(value: Optional[datetime] = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def format_period_label(period_key: str) -> str:
    try:
        year_str, month_str = period_key.split("-")
        month_index = max(1, min(12, int(month_str)))
        month_name = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ][month_index - 1]
        return f"{month_name} {year_str}"
    except Exception:
        return period_key


async def has_email_campaign(user_id: str, campaign_type: str, db: AsyncSession, period_key: Optional[str] = None) -> bool:
    stmt = select(EmailCampaign).where(
        EmailCampaign.user_id == user_id,
        EmailCampaign.campaign_type == campaign_type,
    )
    if period_key is not None:
        stmt = stmt.where(EmailCampaign.period_key == period_key)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none() is not None


async def log_email_campaign(user: User, campaign_type: str, db: AsyncSession, period_key: Optional[str] = None, payload: Optional[dict] = None) -> None:
    db.add(EmailCampaign(
        id=str(uuid.uuid4()),
        user_id=user.id,
        email=user.email,
        campaign_type=campaign_type,
        period_key=period_key,
        payload=payload or {},
    ))
    await db.commit()


def send_welcome_email(user: User) -> bool:
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background:#050505; color:#f5f5f5; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:#0f0f0f; border-radius:24px; padding:32px; border:1px solid #1f1f1f;">
          <p style="letter-spacing:0.24em; text-transform:uppercase; color:#00F0FF; font-size:12px; margin:0 0 12px;">Welcome to RHYTHMIQ</p>
          <h1 style="margin:0 0 16px; color:#FF4D00; font-size:32px;">Your sound identity starts now</h1>
          <p style="line-height:1.7; color:#d4d4d8;">
            Hi {user.username}, your RHYTHMIQ account is live. Search with Spotify-style discovery,
            play with YouTube audio fallback, and let your Music DNA evolve with every session.
          </p>
          <div style="margin:24px 0; padding:20px; border-radius:18px; background:#111827;">
            <p style="margin:0 0 10px; color:#f5f5f5; font-weight:700;">What happens next</p>
            <p style="margin:0; line-height:1.7; color:#cbd5e1;">
              We will send you a monthly wrap by email with your top moods, artists, genres, and listening streaks.
            </p>
          </div>
          <p style="margin:24px 0 0;">
            <a href="{FRONTEND_URL}" style="background:#FF4D00; color:#000; padding:12px 20px; border-radius:999px; text-decoration:none; font-weight:700;">
              Open RHYTHMIQ
            </a>
          </p>
        </div>
      </body>
    </html>
    """
    return send_brevo_email(user.email, "Welcome to RHYTHMIQ", html_content)


async def build_monthly_wrap_summary(user: User, db: AsyncSession, period_key: Optional[str] = None) -> Optional[dict]:
    period_start = get_month_period_start()
    active_period_key = period_key or get_month_period_key(period_start)

    history_result = await db.execute(
        select(ListeningHistory)
        .where(ListeningHistory.user_id == user.id, ListeningHistory.played_at >= period_start)
        .order_by(ListeningHistory.played_at.desc())
    )
    likes_result = await db.execute(
        select(Like).where(Like.user_id == user.id, Like.liked_at >= period_start)
    )
    ratings_result = await db.execute(
        select(Rating).where(Rating.user_id == user.id, Rating.rated_at >= period_start)
    )

    history_entries = history_result.scalars().all()
    likes = likes_result.scalars().all()
    ratings = ratings_result.scalars().all()

    if not history_entries and not likes and not ratings:
        return None

    weighted = apply_taste_profile(likes, ratings, history_entries)

    top_artists = [name for name, _ in sorted(weighted["artist_counts"].items(), key=lambda item: -item[1])[:3]]
    top_genres = [name for name, _ in sorted(weighted["genre_counts"].items(), key=lambda item: -item[1])[:3]]
    top_moods = [name for name, _ in sorted(weighted["mood_scores"].items(), key=lambda item: -item[1])[:3]]

    track_counts = {}
    total_seconds = 0
    skip_count = 0
    unique_artists = set()

    for entry in history_entries:
        track_label = entry.track_name or "Unknown Track"
        track_counts[track_label] = track_counts.get(track_label, 0) + 1
        total_seconds += max(entry.play_duration or 0, 0)
        if entry.skipped:
            skip_count += 1
        if entry.artist_name:
            unique_artists.add(entry.artist_name)

    top_tracks = [
        {"name": name, "plays": plays}
        for name, plays in sorted(track_counts.items(), key=lambda item: (-item[1], item[0]))[:3]
    ]

    total_minutes = round(total_seconds / 60, 1)

    return {
        "period_key": active_period_key,
        "period_label": format_period_label(active_period_key),
        "total_plays": len(history_entries),
        "total_minutes": total_minutes,
        "skip_count": skip_count,
        "unique_artists": len(unique_artists),
        "top_artists": top_artists,
        "top_genres": top_genres,
        "top_moods": top_moods,
        "top_tracks": top_tracks,
    }


def send_monthly_wrap_email(user: User, summary: dict) -> bool:
    top_tracks_markup = "".join(
        f"<li style='margin-bottom:8px;'><strong>{track['name']}</strong> <span style='color:#a1a1aa;'>· {track['plays']} plays</span></li>"
        for track in summary["top_tracks"]
    ) or "<li>Your next favourite track is waiting.</li>"
    top_artists = ", ".join(summary["top_artists"]) or "Still discovering"
    top_genres = ", ".join(summary["top_genres"]) or "Eclectic"
    top_moods = ", ".join(summary["top_moods"]) or "Balanced"
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background:#050505; color:#f5f5f5; padding:24px;">
        <div style="max-width:700px; margin:0 auto; background:linear-gradient(135deg, #111827, #09090b); border-radius:24px; padding:32px; border:1px solid #1f2937;">
          <p style="letter-spacing:0.24em; text-transform:uppercase; color:#00F0FF; font-size:12px; margin:0 0 12px;">Monthly Wrap</p>
          <h1 style="margin:0 0 10px; color:#FF4D00; font-size:34px;">Your {summary['period_label']} sound snapshot</h1>
          <p style="line-height:1.7; color:#d4d4d8; margin-bottom:28px;">
            Hi {user.username}, here is how your month sounded inside RHYTHMIQ so far.
          </p>
          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; margin-bottom:24px;">
            <div style="padding:18px; border-radius:18px; background:#18181b;">
              <p style="margin:0; color:#71717a; font-size:12px; text-transform:uppercase; letter-spacing:0.18em;">Minutes played</p>
              <p style="margin:10px 0 0; font-size:28px; font-weight:700;">{summary['total_minutes']}</p>
            </div>
            <div style="padding:18px; border-radius:18px; background:#18181b;">
              <p style="margin:0; color:#71717a; font-size:12px; text-transform:uppercase; letter-spacing:0.18em;">Tracks played</p>
              <p style="margin:10px 0 0; font-size:28px; font-weight:700;">{summary['total_plays']}</p>
            </div>
            <div style="padding:18px; border-radius:18px; background:#18181b;">
              <p style="margin:0; color:#71717a; font-size:12px; text-transform:uppercase; letter-spacing:0.18em;">Top artists</p>
              <p style="margin:10px 0 0; font-size:18px; font-weight:700; line-height:1.5;">{top_artists}</p>
            </div>
            <div style="padding:18px; border-radius:18px; background:#18181b;">
              <p style="margin:0; color:#71717a; font-size:12px; text-transform:uppercase; letter-spacing:0.18em;">Mood profile</p>
              <p style="margin:10px 0 0; font-size:18px; font-weight:700; line-height:1.5;">{top_moods}</p>
            </div>
          </div>
          <div style="padding:20px; border-radius:18px; background:#111827; margin-bottom:20px;">
            <p style="margin:0 0 10px; color:#f5f5f5; font-weight:700;">Top genres</p>
            <p style="margin:0; color:#cbd5e1; line-height:1.7;">{top_genres}</p>
          </div>
          <div style="padding:20px; border-radius:18px; background:#18181b;">
            <p style="margin:0 0 14px; color:#f5f5f5; font-weight:700;">Most played tracks</p>
            <ol style="margin:0; padding-left:20px; color:#e4e4e7;">
              {top_tracks_markup}
            </ol>
          </div>
        </div>
      </body>
    </html>
    """
    subject = f"Your RHYTHMIQ {summary['period_label']} Wrap"
    return send_brevo_email(user.email, subject, html_content)


async def maybe_send_welcome_email(user: User, db: AsyncSession) -> bool:
    if await has_email_campaign(user.id, "welcome", db):
        return False
    if send_welcome_email(user):
        await log_email_campaign(user, "welcome", db)
        return True
    return False


async def maybe_send_monthly_wrap_email(user: User, db: AsyncSession) -> bool:
    period_key = get_month_period_key()
    if await has_email_campaign(user.id, "monthly_wrap", db, period_key=period_key):
        return False

    summary = await build_monthly_wrap_summary(user, db, period_key=period_key)
    if not summary:
        return False

    if send_monthly_wrap_email(user, summary):
        await log_email_campaign(user, "monthly_wrap", db, period_key=period_key, payload=summary)
        return True
    return False


async def handle_post_login_email_flow(user: User, db: AsyncSession) -> None:
    await ensure_verified_email(user, db)
    await maybe_send_welcome_email(user, db)
    await maybe_send_monthly_wrap_email(user, db)

async def get_current_user(authorization: str = None, db: AsyncSession = Depends(get_db)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    try:
        payload = decode_token(token)
        result = await db.execute(select(User).where(User.id == payload['user_id']))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        pass

    if supabase_enabled():
        profile = await asyncio.to_thread(get_supabase_user, token)
        if profile:
            user = await sync_supabase_user_profile(db, profile)
            await db.commit()
            return user

    raise HTTPException(status_code=401, detail="Invalid token")


# ─── Admin Routes ───

@api_router.get("/admin/users")
async def admin_list_users(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await db.execute(select(User))
    users = result.scalars().all()
    user_lookup = {existing_user.id: existing_user for existing_user in users}
    out = []
    for u in users:
        likes_result = await db.execute(select(Like).where(Like.user_id == u.id).order_by(Like.liked_at.desc()))
        likes = likes_result.scalars().all()

        oauth_result = await db.execute(select(OAuthIdentity).where(OAuthIdentity.user_id == u.id))
        oauth_identities = oauth_result.scalars().all()
        recommendations_result = await db.execute(
            select(AdminRecommendation)
            .where(AdminRecommendation.target_user_id == u.id)
            .order_by(AdminRecommendation.recommended_at.desc())
        )
        received_recommendations = recommendations_result.scalars().all()

        out.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "is_admin": is_admin_user(u),
            "oauth_identities": [
                {
                    "provider": o.provider,
                    "email": o.email,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                }
                for o in oauth_identities
            ],
            "likes": [serialize_like(l) for l in likes],
            "received_recommendations": [
                serialize_admin_recommendation(
                    recommendation,
                    admin_user=user_lookup.get(recommendation.admin_user_id),
                    target_user=u,
                )
                for recommendation in received_recommendations
            ],
        })
    return out


@api_router.get("/admin/recommendations")
async def admin_recommendations(
    user_id: Optional[str] = Query(None),
    authorization: str = Query(None, alias="authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(authorization, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    target_user_id = user_id or user.id
    recommendation_groups = await build_collaborative_recommendations(target_user_id, db)
    return {"user_id": target_user_id, **recommendation_groups}


@api_router.get("/admin/database-tables")
async def admin_database_tables(
    authorization: str = Query(None, alias="authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(authorization, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    def read_table_metadata(sync_conn):
        inspector = inspect(sync_conn)
        table_names = inspector.get_table_names()
        return [
            {
                "name": table_name,
                "columns": [column["name"] for column in inspector.get_columns(table_name)],
            }
            for table_name in sorted(table_names)
        ]

    async with engine.begin() as conn:
        tables = await conn.run_sync(read_table_metadata)

    return {
        **build_database_label(),
        "tables": tables,
        "table_count": len(tables),
        "supabase_project_connected": supabase_enabled(),
    }


@api_router.post("/admin/recommendations")
async def create_admin_recommendation(
    req: AdminRecommendationCreate,
    authorization: str = Query(None, alias="authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin_user = await get_current_user(authorization, db)
    if not is_admin_user(admin_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    target_user_result = await db.execute(select(User).where(User.id == req.target_user_id))
    target_user = target_user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    existing_result = await db.execute(
        select(AdminRecommendation).where(
            AdminRecommendation.target_user_id == req.target_user_id,
            AdminRecommendation.spotify_track_id == req.spotify_track_id,
        )
    )
    recommendation = existing_result.scalar_one_or_none()

    if recommendation is None:
        recommendation = AdminRecommendation(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            target_user_id=req.target_user_id,
            spotify_track_id=req.spotify_track_id,
        )
        db.add(recommendation)

    recommendation.admin_user_id = admin_user.id
    recommendation.track_name = req.track_name
    recommendation.artist_name = req.artist_name
    recommendation.album_name = req.album_name
    recommendation.album_image = req.album_image
    recommendation.duration_ms = req.duration_ms
    recommendation.preview_url = req.preview_url
    recommendation.source_type = req.source_type or "admin_pick"
    recommendation.score = int(round(req.score)) if req.score is not None else None
    recommendation.note = req.note
    recommendation.recommended_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(recommendation)

    return {
        "recommendation": serialize_admin_recommendation(
            recommendation,
            admin_user=admin_user,
            target_user=target_user,
        )
    }


@api_router.get("/admin/login-history")
async def admin_login_history(user_id: Optional[str] = Query(None), authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(UserLogin, User).join(User, User.id == UserLogin.user_id)
    if user_id:
        stmt = stmt.where(UserLogin.user_id == user_id).order_by(UserLogin.logged_in_at.desc()).limit(50)
    else:
        stmt = stmt.order_by(UserLogin.logged_in_at.desc()).limit(500)

    logins_result = await db.execute(stmt)
    logins = logins_result.all()
    return {
        "login_history": [
            {
                "id": login.id,
                "user_id": login.user_id,
                "username": login_user.username,
                "email": login_user.email,
                "login_method": login.login_method,
                "logged_in_at": login.logged_in_at.isoformat() if login.logged_in_at else None,
            }
            for login, login_user in logins
        ]
    }


@api_router.get("/admin/user-statistics")
async def admin_user_statistics(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Get all users with statistics
    users_result = await db.execute(select(User))
    users = users_result.scalars().all()

    stats = []
    for u in users:
        likes_result = await db.execute(select(func.count(Like.id)).where(Like.user_id == u.id))
        likes_count = likes_result.scalar() or 0

        logins_result = await db.execute(select(func.count(UserLogin.id)).where(UserLogin.user_id == u.id))
        logins_count = logins_result.scalar() or 0

        history_result = await db.execute(select(func.count(ListeningHistory.id)).where(ListeningHistory.user_id == u.id))
        history_count = history_result.scalar() or 0

        last_login_result = await db.execute(
            select(UserLogin).where(UserLogin.user_id == u.id).order_by(UserLogin.logged_in_at.desc()).limit(1)
        )
        last_login = last_login_result.scalar_one_or_none()

        stats.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "likes_count": likes_count,
            "logins_count": logins_count,
            "listening_history_count": history_count,
            "last_login": last_login.logged_in_at.isoformat() if last_login and last_login.logged_in_at else None,
            "last_login_method": last_login.login_method if last_login else None,
        })

    return {"user_statistics": sorted(stats, key=lambda x: x["logins_count"], reverse=True)}


# ─── Auth Routes ───

@api_router.post("/auth/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where((User.email == req.email) | (User.username == req.username)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = User(id=str(uuid.uuid4()), username=req.username, email=req.email, password_hash=hashed)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await handle_post_login_email_flow(user, db)
    token = create_token(user.id, user.username)
    return {"token": token, "user": await build_user_payload(user, db)}

@api_router.post("/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    identifier = req.email.strip()
    if identifier.count("@") == 1:
        user_result = await db.execute(select(User).where(User.email.ilike(identifier)))
    else:
        user_result = await db.execute(select(User).where(User.username.ilike(identifier)))
    user = user_result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user.password_hash.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Track login
    db.add(UserLogin(
        id=str(uuid.uuid4()),
        user_id=user.id,
        login_method="email",
    ))
    await db.commit()

    await handle_post_login_email_flow(user, db)
    token = create_token(user.id, user.username)
    return {"token": token, "user": await build_user_payload(user, db)}


@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.email.ilike(req.email.strip())))
    user = user_result.scalar_one_or_none()
    
    if user:
        # Generate 6-digit OTP
        import random
        otp = str(random.randint(100000, 999999))
        
        # Set expiration to 15 minutes from now
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        
        # Create password reset token
        reset_token = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            email=user.email,
            otp=otp,
            expires_at=expires_at,
        )
        db.add(reset_token)
        await db.commit()
        
        # Send OTP via email
        subject = "RHYTHMIQ Password Reset OTP"
        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background:#050505; color:#f5f5f5; padding:24px;">
            <div style="max-width:640px; margin:0 auto; background:#0f0f0f; border-radius:24px; padding:32px; border:1px solid #1f1f1f;">
              <p style="letter-spacing:0.24em; text-transform:uppercase; color:#00F0FF; font-size:12px; margin:0 0 12px;">Password Reset</p>
              <h1 style="margin:0 0 16px; color:#FF4D00; font-size:32px;">Reset your RHYTHMIQ password</h1>
              <p style="line-height:1.7; color:#d4d4d8;">
                Hi {user.username}, we received a request to reset your password. Use the OTP below to reset your password.
              </p>
              <div style="background:#18181b; border-radius:12px; padding:24px; margin:24px 0; text-align:center;">
                <p style="margin:0 0 8px; color:#a1a1aa; font-size:14px;">Your One-Time Password</p>
                <p style="margin:0; color:#FF4D00; font-size:36px; font-weight:bold; letter-spacing:4px;">{otp}</p>
                <p style="margin:16px 0 0; color:#71717a; font-size:12px;">This OTP expires in 15 minutes</p>
              </div>
              <p style="margin:24px 0 0; color:#a1a1aa; font-size:14px;">
                If you didn't request this password reset, please ignore this email.
              </p>
            </div>
          </body>
        </html>
        """
        
        if send_brevo_email(user.email, subject, html_content):
            logger.info("Password reset OTP sent to user: %s", user.email)
        else:
            logger.error("Failed to send password reset OTP to user: %s", user.email)
    
    return {"detail": "If this email is registered, password reset instructions have been sent."}


@api_router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    # Find the user
    user_result = await db.execute(select(User).where(User.email.ilike(req.email.strip())))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or OTP")
    
    # Find valid reset token
    token_result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.otp == req.otp,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.now(timezone.utc)
        ).order_by(PasswordResetToken.created_at.desc()).limit(1)
    )
    token = token_result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Update password
    hashed_password = hash_password(req.new_password)
    user.password_hash = hashed_password
    
    # Mark token as used
    token.used = True
    
    await db.commit()
    
    return {"detail": "Password reset successfully"}


@api_router.post("/auth/google")
async def google_login(req: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google login is not configured")

    try:
        token_info = google_id_token.verify_oauth2_token(
            req.credential,
            google_auth_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Google credential") from exc

    email = token_info.get("email")
    google_sub = token_info.get("sub")
    name = token_info.get("name") or (email.split("@")[0] if email else "rhythmiq_user")
    picture = token_info.get("picture")

    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google account did not return required profile data")

    identity_result = await db.execute(
        select(OAuthIdentity).where(and_(OAuthIdentity.provider == "google", OAuthIdentity.provider_user_id == google_sub))
    )
    identity = identity_result.scalar_one_or_none()

    if identity:
        user_result = await db.execute(select(User).where(User.id == identity.user_id))
        user = user_result.scalar_one()
    else:
        user_result = await db.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if not user:
            username = await generate_unique_username(name.replace(" ", "_").lower(), db)
            user = User(
                id=str(uuid.uuid4()),
                username=username,
                email=email,
                password_hash=bcrypt.hashpw(uuid.uuid4().hex.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
                avatar_url=picture,
            )
            db.add(user)
            await db.flush()
        elif picture and not user.avatar_url:
            user.avatar_url = picture

        db.add(OAuthIdentity(
            id=str(uuid.uuid4()),
            user_id=user.id,
            provider="google",
            provider_user_id=google_sub,
            email=email,
        ))
        await db.commit()
        await db.refresh(user)

    # Track login
    db.add(UserLogin(
        id=str(uuid.uuid4()),
        user_id=user.id,
        login_method="google",
    ))
    await db.commit()

    await handle_post_login_email_flow(user, db)
    token = create_token(user.id, user.username)
    return {"token": token, "user": await build_user_payload(user, db)}

@api_router.get("/auth/me")
async def get_me(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_current_user(authorization, db)
    return await build_user_payload(user, db)


@api_router.get("/supabase/status")
async def supabase_status():
    status = await asyncio.to_thread(ping_supabase)
    return {
        "configured": supabase_enabled(),
        **status,
    }


@api_router.get("/recommendations/admin")
async def get_admin_recommendations_for_user(
    authorization: str = Query(None, alias="authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(authorization, db)

    recommendations_result = await db.execute(
        select(AdminRecommendation).where(AdminRecommendation.target_user_id == user.id).order_by(AdminRecommendation.recommended_at.desc())
    )
    recommendations = recommendations_result.scalars().all()

    admin_ids = {recommendation.admin_user_id for recommendation in recommendations}
    admin_lookup = {}
    if admin_ids:
        admins_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        admin_lookup = {admin.id: admin for admin in admins_result.scalars().all()}

    return {
        "recommendations": [
            serialize_admin_recommendation(
                recommendation,
                admin_user=admin_lookup.get(recommendation.admin_user_id),
                target_user=user,
            )
            for recommendation in recommendations
        ]
    }


@api_router.post("/auth/resend-verification")
async def resend_verification(req: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    return {"status": "not_required", "message": "Email verification is disabled. RHYTHMIQ now sends welcome and monthly wrap emails instead."}


@api_router.get("/auth/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    return {"status": "not_required", "message": "Email verification is no longer required for this demo."}

# ─── Spotify Proxy Routes ───

@api_router.get("/spotify/search")
async def spotify_search(q: str, type: str = "track", limit: int = 20, offset: int = 0):
    try:
        results = sp.search(q=q, type=type, limit=limit, offset=offset)
        return results
    except Exception as e:
        logger.warning(f"Spotify search fallback: {e}")
        if type == "track":
            youtube_tracks = await search_youtube_tracks(q, limit)
            if youtube_tracks:
                return {"tracks": {"items": youtube_tracks, "total": len(youtube_tracks)}}
        return search_sample_data(q, type, limit)

@api_router.get("/spotify/track/{track_id}")
async def spotify_track(track_id: str):
    try:
        track = sp.track(track_id)
        return track
    except Exception as e:
        found = next((t for t in SAMPLE_TRACKS if t["id"] == track_id), None)
        return found or SAMPLE_TRACKS[0]

@api_router.get("/spotify/track/{track_id}/features")
async def spotify_audio_features(track_id: str):
    try:
        features = sp.audio_features([track_id])
        return features[0] if features else SAMPLE_AUDIO_FEATURES
    except Exception as e:
        return SAMPLE_AUDIO_FEATURES

@api_router.get("/spotify/artist/{artist_id}")
async def spotify_artist(artist_id: str):
    try:
        artist = sp.artist(artist_id)
        return artist
    except Exception as e:
        found = next((a for a in SAMPLE_ARTISTS if a["id"] == artist_id), None)
        return found or SAMPLE_ARTISTS[0]

@api_router.get("/spotify/artist/{artist_id}/top-tracks")
async def spotify_artist_top_tracks(artist_id: str, market: str = "US"):
    try:
        tracks = sp.artist_top_tracks(artist_id, country=market)
        return tracks
    except Exception as e:
        artist = next((a for a in SAMPLE_ARTISTS if a["id"] == artist_id), SAMPLE_ARTISTS[0])
        matching = [t for t in SAMPLE_TRACKS if t["artists"][0]["id"] == artist_id]
        if not matching:
            matching = SAMPLE_TRACKS[:5]
        return {"tracks": matching}

@api_router.get("/spotify/artist/{artist_id}/related")
async def spotify_related_artists(artist_id: str):
    try:
        artists = sp.artist_related_artists(artist_id)
        return artists
    except Exception as e:
        related = [a for a in SAMPLE_ARTISTS if a["id"] != artist_id]
        return {"artists": related}

@api_router.get("/spotify/artist/{artist_id}/albums")
async def spotify_artist_albums(artist_id: str, limit: int = 20):
    try:
        albums = sp.artist_albums(artist_id, limit=limit)
        return albums
    except Exception as e:
        matching = [a for a in SAMPLE_ALBUMS if a["artists"][0]["id"] == artist_id]
        if not matching:
            matching = SAMPLE_ALBUMS[:3]
        return {"items": matching}

@api_router.get("/spotify/album/{album_id}")
async def spotify_album(album_id: str):
    try:
        album = sp.album(album_id)
        return album
    except Exception as e:
        found = next((a for a in SAMPLE_ALBUMS if a["id"] == album_id), SAMPLE_ALBUMS[0])
        # Add tracks to album
        album_tracks = [t for t in SAMPLE_TRACKS if t["album"]["id"] == album_id]
        if not album_tracks:
            album_tracks = SAMPLE_TRACKS[:6]
        found_copy = {**found, "tracks": {"items": album_tracks}}
        return found_copy

@api_router.get("/spotify/browse/new-releases")
async def spotify_new_releases(limit: int = 20, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_optional_user(authorization, db)
    taste_profile = await build_user_taste_profile(user.id, db) if user else None
    album_items = []
    if sp:
        try:
            album_items = sp.new_releases(limit=max(limit, 12)).get("albums", {}).get("items", [])
        except Exception as exc:
            logger.warning(f"New releases album lookup failed: {exc}")

    if not album_items:
        album_items = rank_albums_for_user(SAMPLE_ALBUMS, taste_profile, limit)

    release_queries = [
        "latest hindi songs 2026",
        "new bollywood songs 2026",
        "latest hindi romantic songs 2026",
        "latest punjabi songs 2026",
    ]
    if taste_profile and taste_profile.get("has_data"):
        release_queries.extend(
            f"{artist} latest hindi song"
            for artist in taste_profile["top_artists"][:2]
        )
        release_queries.extend(
            f"{genre} hindi new songs"
            for genre in taste_profile["top_genres"][:2]
        )

    youtube_release_tracks = await collect_youtube_track_candidates(
        release_queries,
        per_query=max(6, limit),
    )
    ranked_release_tracks = sorted(
        youtube_release_tracks,
        key=lambda track: (
            score_track_against_taste(track, taste_profile),
            track.get("popularity") or 0,
        ),
        reverse=True,
    )

    if not ranked_release_tracks:
        release_candidates = collect_track_candidates(release_queries, per_query=max(6, limit))
        ranked_release_tracks = sorted(
            release_candidates,
            key=lambda track: (
                score_release_freshness((track.get("album") or {}).get("release_date")) +
                score_track_against_taste(track, taste_profile)
            ),
            reverse=True,
        )
    if not ranked_release_tracks:
        ranked_release_tracks = rank_tracks_for_user(SAMPLE_TRACKS, taste_profile, limit)

    return {
        "albums": {"items": album_items[:limit]},
        "tracks": ranked_release_tracks[:limit],
    }

@api_router.get("/spotify/browse/trending")
async def spotify_trending(limit: int = 20):
    try:
        results = sp.search(q="top hits 2025", type="track", limit=limit)
        return results
    except Exception as e:
        return {"tracks": {"items": SAMPLE_TRACKS[:limit]}}

@api_router.get("/spotify/recommendations")
async def spotify_recommendations(seed_genres: str = "", query: str = "", limit: int = 20, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    """Search-based recommendations since /recommendations API is deprecated"""
    user = await get_optional_user(authorization, db)
    taste_profile = await build_user_taste_profile(user.id, db) if user else None
    liked_track_ids = set()
    if user:
        liked_tracks_result = await db.execute(select(Like.spotify_track_id).where(Like.user_id == user.id))
        liked_track_ids = {row[0] for row in liked_tracks_result.all()}

    if query:
        recommendation_queries = [query]
    else:
        recommendation_queries = []
        if taste_profile and taste_profile.get("has_data"):
            recommendation_queries.extend(f'artist:"{artist}"' for artist in taste_profile["top_artists"][:2])
            recommendation_queries.extend(f"{genre} songs" for genre in taste_profile["top_genres"][:2])
            recommendation_queries.extend(f"{mood} music mix" for mood in taste_profile["top_moods"][:1])
        if seed_genres:
            recommendation_queries.extend(term for term in seed_genres.replace(",", " ").split() if term)
        if not recommendation_queries:
            recommendation_queries = ["popular music", "hindi english mix"]

    recommendation_candidates = collect_track_candidates(recommendation_queries, per_query=max(limit, 6))
    filtered_candidates = [
        track
        for track in recommendation_candidates
        if track.get("id") not in liked_track_ids
    ]

    ranked_candidates = rank_tracks_for_user(filtered_candidates or recommendation_candidates or SAMPLE_TRACKS, taste_profile, limit)
    return {"tracks": ranked_candidates[:limit]}


@api_router.get("/youtube/search")
async def youtube_search(track_name: str, artist_name: Optional[str] = None):
    match = await search_youtube_video(track_name, artist_name)
    if not match:
        return {"video_id": None}
    return match


@api_router.post("/youtube/batch-resolve")
async def youtube_batch_resolve(items: List[YouTubeTrackMatch]):
    results = await asyncio.gather(
        *(search_youtube_video(item.track_name, item.artist_name) for item in items)
    )
    return {
        "items": [
            {
                "track_name": item.track_name,
                "artist_name": item.artist_name,
                **(match or {"video_id": None}),
            }
            for item, match in zip(items, results)
        ]
    }


@api_router.post("/youtube/audio-source")
async def youtube_audio_source(req: YouTubeAudioSourceRequest):
    match = None

    if req.video_id:
        match = {"video_id": req.video_id}
    elif req.track_name:
        match = await search_youtube_video(req.track_name, req.artist_name)

    if not match or not match.get("video_id"):
        return {"video_id": None, "stream_url": None}

    audio_source = await get_youtube_audio_source(match["video_id"])
    if not audio_source:
        return {"video_id": match["video_id"], "stream_url": None}

    return audio_source


@api_router.get("/youtube/download")
async def youtube_download(
    video_id: Optional[str] = None,
    track_name: Optional[str] = None,
    artist_name: Optional[str] = None,
):
    match = None

    if video_id:
        match = {"video_id": video_id, "title": track_name or "RHYTHMIQ Track"}
    else:
        if not track_name:
            raise HTTPException(status_code=400, detail="track_name or video_id is required")
        match = await search_youtube_video(track_name, artist_name)

    if not match or not match.get("video_id"):
        raise HTTPException(status_code=404, detail="Unable to resolve a downloadable audio source")

    audio_source = await get_youtube_audio_source(match["video_id"])
    stream_url = audio_source.get("stream_url") if audio_source else None
    if not stream_url:
        raise HTTPException(status_code=404, detail="Audio stream is unavailable for this track")

    try:
        upstream = requests.get(
            stream_url,
            stream=True,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0 RHYTHMIQ Downloader"},
        )
        upstream.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Failed to fetch downloadable audio") from exc

    content_type = upstream.headers.get("Content-Type", "audio/mpeg")
    file_ext = "mp3"
    lowered_content_type = content_type.lower()
    if "webm" in lowered_content_type:
        file_ext = "webm"
    elif "mp4" in lowered_content_type or "m4a" in lowered_content_type or "aac" in lowered_content_type:
        file_ext = "m4a"

    safe_track_name = re.sub(r'[^a-zA-Z0-9._ -]+', '', (track_name or match.get("title") or "RHYTHMIQ Track")).strip() or "RHYTHMIQ Track"
    safe_artist_name = re.sub(r'[^a-zA-Z0-9._ -]+', '', (artist_name or "")).strip()
    filename = f"{safe_track_name} - {safe_artist_name}.{file_ext}" if safe_artist_name else f"{safe_track_name}.{file_ext}"

    def iter_audio_stream():
        try:
            for chunk in upstream.iter_content(chunk_size=1024 * 64):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        iter_audio_stream(),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )

# ─── Time-of-Day Suggestions ───

@api_router.get("/suggestions/time-of-day")
async def time_of_day_suggestions(hour: Optional[int] = None, limit: int = 20, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    from datetime import datetime as dt
    current_hour = hour if hour is not None else dt.now().hour
    user = await get_optional_user(authorization, db)
    taste_profile = await build_user_taste_profile(user.id, db) if user else None
    
    if 5 <= current_hour < 11:
        period = "morning"
        search_query = "morning vibes hindi english mix feel good"
        mood = "Fresh Hindi + English morning vibes"
    elif 11 <= current_hour < 16:
        period = "afternoon"
        search_query = "afternoon chill hindi english mix focus"
        mood = "Hindi + English afternoon lift"
    elif 16 <= current_hour < 20:
        period = "evening"
        search_query = "evening vibes hindi english mix sunset"
        mood = "Hindi + English evening vibes"
    elif 20 <= current_hour < 24:
        period = "night"
        search_query = "night vibes hindi bollywood songs"
        mood = "Hindi YouTube night vibes"
    else:
        period = "late_night"
        search_query = "late night soft hindi songs"
        mood = "Hindi YouTube late-night calm"

    if period in {"night", "late_night"}:
        youtube_queries = [
            search_query,
            f"{period.replace('_', ' ')} hindi songs",
            f"{period.replace('_', ' ')} bollywood songs",
        ]
        if period == "night":
            youtube_queries.extend([
                "hindi night drive songs",
                "bollywood party night songs",
            ])
        else:
            youtube_queries.extend([
                "late night hindi romantic songs",
                "hindi soft songs for night",
            ])

        if taste_profile and taste_profile.get("has_data"):
            youtube_queries.extend(
                f"{artist} {period.replace('_', ' ')} songs"
                for artist in taste_profile["top_artists"][:2]
            )
            youtube_queries.extend(
                f"{genre} hindi {period.replace('_', ' ')} songs"
                for genre in taste_profile["top_genres"][:2]
            )

        youtube_tracks = await collect_youtube_track_candidates(
            youtube_queries,
            per_query=max(6, limit),
        )
        ranked_youtube_tracks = rank_tracks_for_user(
            youtube_tracks or get_sample_tracks_for_period(period) + SAMPLE_TRACKS,
            taste_profile,
            limit,
            period,
        )
        personalized_mood = mood
        if taste_profile and taste_profile.get("has_data"):
            anchor = taste_profile["top_artists"][:1] or taste_profile["top_genres"][:1]
            if anchor:
                personalized_mood = f"{mood} tuned with {anchor[0]}"
        return {
            "period": period,
            "mood": personalized_mood,
            "hour": current_hour,
            "tracks": ranked_youtube_tracks[:limit],
        }
    
    try:
        personalized_query = search_query
        if taste_profile and taste_profile.get("has_data"):
            personalized_query = " ".join([
                search_query,
                *taste_profile["top_genres"][:2],
                *taste_profile["top_moods"][:1],
                *taste_profile["top_artists"][:1],
            ])
        results = sp.search(q=personalized_query, type="track", limit=limit)
        tracks = results.get("tracks", {}).get("items", [])
        return {"period": period, "mood": mood, "hour": current_hour, "tracks": tracks}
    except Exception as e:
        logger.warning(f"Time suggestions fallback: {e}")
        fallback_tracks = rank_tracks_for_user(get_sample_tracks_for_period(period) + SAMPLE_TRACKS, taste_profile, limit, period)
        personalized_mood = mood
        if taste_profile and taste_profile.get("has_data"):
            anchor = taste_profile["top_moods"][:1] or taste_profile["top_genres"][:1]
            if anchor:
                personalized_mood = f"{mood} tuned to your {anchor[0].lower()} taste"
        return {"period": period, "mood": personalized_mood, "hour": current_hour, "tracks": fallback_tracks}

# ─── Playlist Routes ───

@api_router.post("/playlists")
async def create_playlist(req: PlaylistCreate, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    playlist = Playlist(id=str(uuid.uuid4()), user_id=user.id, name=req.name, description=req.description, is_public=req.is_public, cover_url=req.cover_url)
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return {"id": playlist.id, "name": playlist.name, "description": playlist.description, "is_public": playlist.is_public, "cover_url": playlist.cover_url, "created_at": playlist.created_at.isoformat(), "songs": []}

@api_router.get("/playlists")
async def get_playlists(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(
        select(Playlist).where(Playlist.user_id == user.id).options(selectinload(Playlist.songs)).order_by(Playlist.created_at.desc())
    )
    playlists = result.scalars().all()
    return [{"id": p.id, "name": p.name, "description": p.description, "is_public": p.is_public, "cover_url": p.cover_url, "created_at": p.created_at.isoformat(), "song_count": len(p.songs), "first_image": p.songs[0].album_image if p.songs else None} for p in playlists]

@api_router.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(
        select(Playlist).where(Playlist.id == playlist_id).options(selectinload(Playlist.songs))
    )
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    songs = [{"id": s.id, "spotify_track_id": s.spotify_track_id, "track_name": s.track_name, "artist_name": s.artist_name, "album_name": s.album_name, "album_image": s.album_image, "duration_ms": s.duration_ms, "preview_url": s.preview_url, "position": s.position} for s in playlist.songs]
    return {"id": playlist.id, "name": playlist.name, "description": playlist.description, "is_public": playlist.is_public, "cover_url": playlist.cover_url, "created_at": playlist.created_at.isoformat(), "songs": songs}

@api_router.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, req: PlaylistUpdate, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Playlist).where(and_(Playlist.id == playlist_id, Playlist.user_id == user.id)))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if req.name is not None:
        playlist.name = req.name
    if req.description is not None:
        playlist.description = req.description
    if req.is_public is not None:
        playlist.is_public = req.is_public
    if req.cover_url is not None:
        playlist.cover_url = req.cover_url
    await db.commit()
    return {"status": "updated"}

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Playlist).where(and_(Playlist.id == playlist_id, Playlist.user_id == user.id)))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.delete(playlist)
    await db.commit()
    return {"status": "deleted"}

@api_router.post("/playlists/{playlist_id}/songs")
async def add_song_to_playlist(playlist_id: str, req: AddSongToPlaylist, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Playlist).where(and_(Playlist.id == playlist_id, Playlist.user_id == user.id)).options(selectinload(Playlist.songs)))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    position = len(playlist.songs)
    song = PlaylistSong(id=str(uuid.uuid4()), playlist_id=playlist_id, spotify_track_id=req.spotify_track_id, track_name=req.track_name, artist_name=req.artist_name, album_name=req.album_name, album_image=req.album_image, duration_ms=req.duration_ms, preview_url=req.preview_url, position=position)
    db.add(song)
    await db.commit()
    return {"status": "added", "position": position}

@api_router.delete("/playlists/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(playlist_id: str, song_id: str, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(PlaylistSong).where(and_(PlaylistSong.id == song_id, PlaylistSong.playlist_id == playlist_id)))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    await db.delete(song)
    await db.commit()
    return {"status": "removed"}

# ─── Likes Routes ───

@api_router.post("/likes/toggle")
async def toggle_like(req: LikeToggle, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Like).where(and_(Like.user_id == user.id, Like.spotify_track_id == req.spotify_track_id)))
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"liked": False}
    else:
        like = Like(id=str(uuid.uuid4()), user_id=user.id, spotify_track_id=req.spotify_track_id, track_name=req.track_name, artist_name=req.artist_name, album_name=req.album_name, album_image=req.album_image, duration_ms=req.duration_ms, preview_url=req.preview_url)
        db.add(like)
        await db.commit()
        return {"liked": True}

@api_router.get("/likes")
async def get_likes(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Like).where(Like.user_id == user.id).order_by(Like.liked_at.desc()))
    likes = result.scalars().all()
    return [{"id": l.id, "spotify_track_id": l.spotify_track_id, "track_name": l.track_name, "artist_name": l.artist_name, "album_name": l.album_name, "album_image": l.album_image, "duration_ms": l.duration_ms, "preview_url": l.preview_url, "liked_at": l.liked_at.isoformat()} for l in likes]

@api_router.get("/likes/check/{track_id}")
async def check_like(track_id: str, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Like).where(and_(Like.user_id == user.id, Like.spotify_track_id == track_id)))
    return {"liked": result.scalar_one_or_none() is not None}

# ─── Rating Routes ───

@api_router.post("/ratings")
async def set_rating(req: RatingSet, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Rating).where(and_(Rating.user_id == user.id, Rating.spotify_track_id == req.spotify_track_id)))
    existing = result.scalar_one_or_none()
    if existing:
        existing.stars = req.stars
        existing.rated_at = datetime.now(timezone.utc)
    else:
        rating = Rating(id=str(uuid.uuid4()), user_id=user.id, spotify_track_id=req.spotify_track_id, stars=req.stars, track_name=req.track_name, artist_name=req.artist_name, album_image=req.album_image)
        db.add(rating)
    await db.commit()
    return {"stars": req.stars}

@api_router.get("/ratings")
async def get_ratings(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Rating).where(Rating.user_id == user.id).order_by(Rating.rated_at.desc()))
    ratings = result.scalars().all()
    return [{"id": r.id, "spotify_track_id": r.spotify_track_id, "track_name": r.track_name, "artist_name": r.artist_name, "album_image": r.album_image, "stars": r.stars, "rated_at": r.rated_at.isoformat()} for r in ratings]

@api_router.get("/ratings/check/{track_id}")
async def check_rating(track_id: str, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(Rating).where(and_(Rating.user_id == user.id, Rating.spotify_track_id == track_id)))
    rating = result.scalar_one_or_none()
    return {"stars": rating.stars if rating else 0}

# ─── Listening History ───

@api_router.post("/history")
async def log_history(req: HistoryLog, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    entry = ListeningHistory(id=str(uuid.uuid4()), user_id=user.id, spotify_track_id=req.spotify_track_id, track_name=req.track_name, artist_name=req.artist_name, genre=req.genre, play_duration=req.play_duration, skipped=req.skipped)
    db.add(entry)
    await db.commit()
    return {"status": "logged"}

@api_router.get("/history")
async def get_history(limit: int = 50, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(select(ListeningHistory).where(ListeningHistory.user_id == user.id).order_by(ListeningHistory.played_at.desc()).limit(limit))
    history = result.scalars().all()
    return [{"id": h.id, "spotify_track_id": h.spotify_track_id, "track_name": h.track_name, "artist_name": h.artist_name, "genre": h.genre, "played_at": h.played_at.isoformat(), "play_duration": h.play_duration, "skipped": h.skipped} for h in history]

# ─── Music DNA ───

@api_router.get("/dna")
async def get_music_dna(authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)

    likes_result = await db.execute(select(Like).where(Like.user_id == user.id))
    likes = likes_result.scalars().all()

    ratings_result = await db.execute(select(Rating).where(Rating.user_id == user.id))
    ratings = ratings_result.scalars().all()

    history_result = await db.execute(
        select(ListeningHistory).where(ListeningHistory.user_id == user.id).order_by(ListeningHistory.played_at.desc()).limit(300)
    )
    history = history_result.scalars().all()

    track_ids = set()
    for l in likes:
        track_ids.add(l.spotify_track_id)
    for r in ratings:
        track_ids.add(r.spotify_track_id)
    for h in history:
        track_ids.add(h.spotify_track_id)

    if not track_ids:
        return {"genre_breakdown": {}, "mood_breakdown": {}, "top_artists": [], "total_tracks": 0}

    genre_counts = {}
    mood_scores = {}
    artist_counts = {}

    for like in likes:
        profile = infer_track_profile(like.spotify_track_id, like.track_name, like.artist_name)
        weight = 3.0
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    for rating in ratings:
        profile = infer_track_profile(rating.spotify_track_id, rating.track_name, rating.artist_name)
        weight = 1.5 + (rating.stars * 0.7)
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    for entry in history:
        profile = infer_track_profile(entry.spotify_track_id, entry.track_name, entry.artist_name)
        weight = history_weight(entry)
        add_weighted_score(artist_counts, profile["artist_name"], weight)
        for genre in profile["genres"]:
            add_weighted_score(genre_counts, genre, weight)
        for mood in profile["moods"]:
            add_weighted_score(mood_scores, mood, weight)

    total_genre = sum(genre_counts.values()) or 1
    genre_breakdown = {k: round(v / total_genre * 100, 1) for k, v in sorted(genre_counts.items(), key=lambda x: -x[1])[:10]}

    top_artists = [{"name": k, "count": round(v, 1)} for k, v in sorted(artist_counts.items(), key=lambda x: -x[1])[:10]]

    total_mood = sum(mood_scores.values()) or 1
    mood_breakdown = {k: round(v / total_mood * 100, 1) for k, v in sorted(mood_scores.items(), key=lambda x: -x[1])[:8]}

    if not mood_breakdown:
        mood_breakdown = {"Chill": 40, "Energetic": 35, "Happy": 25}

    week_key = datetime.now(timezone.utc).strftime("%Y-W%U")
    snapshot_result = await db.execute(
        select(DNASnapshot).where(and_(DNASnapshot.user_id == user.id, DNASnapshot.week == week_key))
    )
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot:
        snapshot.genre_breakdown = genre_breakdown
        snapshot.mood_breakdown = mood_breakdown
        snapshot.top_artists = top_artists
        snapshot.calculated_at = datetime.now(timezone.utc)
    else:
        db.add(DNASnapshot(
            id=str(uuid.uuid4()),
            user_id=user.id,
            week=week_key,
            genre_breakdown=genre_breakdown,
            mood_breakdown=mood_breakdown,
            top_artists=top_artists,
        ))
    await db.commit()

    return {
        "genre_breakdown": genre_breakdown,
        "mood_breakdown": mood_breakdown,
        "top_artists": top_artists,
        "total_tracks": len(track_ids),
        "total_listens": len(history),
        "week": week_key,
    }

# ─── LYRA AI Assistant ───

@api_router.post("/lyra/chat")
async def lyra_chat(req: LyraChat, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    
    # Save user message
    user_msg = LyraMessage(id=str(uuid.uuid4()), user_id=user.id, role="user", content=req.message)
    db.add(user_msg)
    
    # Get recent messages for context
    result = await db.execute(
        select(LyraMessage).where(LyraMessage.user_id == user.id).order_by(LyraMessage.created_at.desc()).limit(10)
    )
    recent_msgs = list(reversed(result.scalars().all()))
    
    response_text = None
    used_local_reply = False

    preferred_provider = LYRA_PROVIDER or ("emergent" if EMERGENT_LLM_KEY else "openai" if OPENAI_API_KEY else "local")

    if preferred_provider == "emergent" and EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage

            system_prompt = f"""You are LYRA, the AI music assistant for RHYTHMIQ. You are witty, knowledgeable about music, and speak casually like a cool friend who knows everything about music. 
            
The user's name is {user.username}. Help them discover music, create playlists, understand their taste, and have fun conversations about music.

When recommending songs, mention specific track names and artists. Be concise but engaging. Use music terminology naturally.

If they ask you to play something or create a playlist, suggest specific songs they might like. If they describe a mood, recommend music that fits."""

            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"lyra_{user.id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}",
                system_message=system_prompt
            )
            chat.with_model("anthropic", "claude-sonnet-4-5-20250929")

            message = UserMessage(text=req.message)
            response_text = await chat.send_message(message)
        except Exception as e:
            logger.error(f"LYRA error: {e}")

    if not response_text and preferred_provider in {"openai", "local"} and OPENAI_API_KEY:
        try:
            client = AsyncOpenAI(api_key=OPENAI_API_KEY)
            system_prompt = (
                f"You are LYRA, the RHYTHMIQ AI music assistant. "
                f"The user's name is {user.username}. Be concise, warm, and specific with music recommendations."
            )
            completion = await client.chat.completions.create(
                model=LYRA_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    *[
                        {"role": msg.role, "content": msg.content}
                        for msg in recent_msgs[-6:]
                    ],
                ],
                temperature=0.8,
            )
            response_text = completion.choices[0].message.content
        except Exception as e:
            logger.error(f"LYRA OpenAI error: {e}")

    suggested_tracks = await build_lyra_track_suggestions(req.message, user.id, db, limit=6)

    if not response_text:
        used_local_reply = True

    if used_local_reply or is_lyra_discovery_request(req.message):
        response_text = build_local_lyra_reply(req.message, user.username, suggested_tracks)

    assistant_msg = LyraMessage(id=str(uuid.uuid4()), user_id=user.id, role="assistant", content=response_text)
    db.add(assistant_msg)
    await db.commit()

    return {"response": response_text, "role": "assistant", "tracks": suggested_tracks}


@api_router.get("/lyra/config")
async def lyra_config():
    active_provider = "emergent" if EMERGENT_LLM_KEY else "openai" if OPENAI_API_KEY else "local"
    return {
        "provider": LYRA_PROVIDER or active_provider,
        "emergent_configured": bool(EMERGENT_LLM_KEY),
        "openai_configured": bool(OPENAI_API_KEY),
    }

@api_router.get("/lyra/history")
async def lyra_history(limit: int = 50, authorization: str = Query(None, alias="authorization"), db: AsyncSession = Depends(get_db)):
    user = await get_current_user(authorization, db)
    result = await db.execute(
        select(LyraMessage).where(LyraMessage.user_id == user.id).order_by(LyraMessage.created_at.desc()).limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]

# ─── Song Deep Dive ───

@api_router.get("/song-dive/{track_id}")
async def song_deep_dive(track_id: str):
    try:
        try:
            track = sp.track(track_id)
            features = sp.audio_features([track_id])
            audio = features[0] if features else SAMPLE_AUDIO_FEATURES
        except Exception as e:
            logger.warning(f"Song dive fallback: {e}")
            track = next((t for t in SAMPLE_TRACKS if t["id"] == track_id), SAMPLE_TRACKS[0])
            audio = SAMPLE_AUDIO_FEATURES
        
        # Map key number to key name
        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        key_name = key_names[audio.get('key', 0)] if audio else 'Unknown'
        mode = 'Major' if audio.get('mode', 0) == 1 else 'Minor'
        
        # Estimate instruments based on audio features
        instruments = []
        if audio:
            if audio.get('acousticness', 0) > 0.5:
                instruments.extend(['Acoustic Guitar', 'Piano'])
            if audio.get('instrumentalness', 0) > 0.5:
                instruments.extend(['Synthesizer', 'Strings'])
            if audio.get('energy', 0) > 0.7:
                instruments.extend(['Electric Guitar', 'Drums'])
            if audio.get('danceability', 0) > 0.7:
                instruments.extend(['Bass', '808'])
            if not instruments:
                instruments = ['Vocals', 'Piano', 'Drums']
        
        # Mood tags from features
        moods = []
        if audio:
            if audio.get('valence', 0) > 0.6:
                moods.append('Happy')
            elif audio.get('valence', 0) < 0.3:
                moods.append('Melancholic')
            if audio.get('energy', 0) > 0.7:
                moods.append('Energetic')
            elif audio.get('energy', 0) < 0.3:
                moods.append('Calm')
            if audio.get('danceability', 0) > 0.7:
                moods.append('Groovy')
            if not moods:
                moods = ['Balanced']
        
        return {
            "track": {
                "name": track.get('name'),
                "artists": [a.get('name', a) if isinstance(a, dict) else a for a in track.get('artists', [])],
                "album": track.get('album', {}).get('name') if isinstance(track.get('album'), dict) else track.get('album', ''),
                "album_image": track.get('album', {}).get('images', [{}])[0].get('url', '') if isinstance(track.get('album'), dict) else '',
                "duration_ms": track.get('duration_ms'),
                "preview_url": track.get('preview_url'),
                "release_date": track.get('album', {}).get('release_date', '') if isinstance(track.get('album'), dict) else '',
                "popularity": track.get('popularity')
            },
            "audio_features": {
                "bpm": round(audio.get('tempo', 0)),
                "key": f"{key_name} {mode}",
                "time_signature": f"{audio.get('time_signature', 4)}/4",
                "energy": round(audio.get('energy', 0) * 100),
                "danceability": round(audio.get('danceability', 0) * 100),
                "valence": round(audio.get('valence', 0) * 100),
                "acousticness": round(audio.get('acousticness', 0) * 100),
                "instrumentalness": round(audio.get('instrumentalness', 0) * 100),
                "speechiness": round(audio.get('speechiness', 0) * 100),
                "liveness": round(audio.get('liveness', 0) * 100)
            },
            "instruments": list(set(instruments)),
            "moods": moods
        }
    except Exception as e:
        logger.error(f"Song dive error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Root ───

@api_router.get("/")
async def root():
    return {"message": "RHYTHMIQ API v1.0"}

# Include router and middleware
app.include_router(api_router)

if (FRONTEND_BUILD_DIR / "static").exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_BUILD_DIR / "static")), name="frontend-static")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            'CORS_ORIGINS',
            'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001',
        ).split(',')
        if origin.strip()
    ],
    allow_origin_regex=r"https?://((localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?|[a-z0-9-]+\.loca\.lt|[a-z0-9-]+\.localtunnel\.me|[a-z0-9-]+\.trycloudflare\.com|[a-z0-9-]+\.onrender\.com)$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def serve_frontend_root():
    index_path = FRONTEND_BUILD_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "RHYTHMIQ frontend build not found. Run npm run build in frontend."}


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend_app(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    requested_path = FRONTEND_BUILD_DIR / full_path
    if requested_path.exists() and requested_path.is_file():
        return FileResponse(requested_path)

    index_path = FRONTEND_BUILD_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Frontend build not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))

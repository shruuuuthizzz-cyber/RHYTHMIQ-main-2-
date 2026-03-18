"""
Sample music data for when Spotify API is unavailable (Development Mode restrictions).
All data is illustrative and uses royalty-free preview URLs where possible.
"""
import re

SAMPLE_ARTISTS = [
    {
        "id": "sample_artist_1", "name": "Neon Pulse", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["electronic", "synthwave", "dance"], "popularity": 85,
        "followers": {"total": 2400000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_2", "name": "Luna Rivera", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["r&b", "soul", "pop"], "popularity": 78,
        "followers": {"total": 1800000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_3", "name": "Midnight Horizon", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["indie", "alternative", "dream-pop"], "popularity": 72,
        "followers": {"total": 950000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_4", "name": "Kai Storm", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["hip-hop", "rap", "trap"], "popularity": 90,
        "followers": {"total": 5200000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_5", "name": "Velvet Echo", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1514525253440-b393452e8d26?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["lo-fi", "ambient", "chill"], "popularity": 65,
        "followers": {"total": 620000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_6", "name": "Aarav Malhotra", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1501612780327-45045538702b?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["bollywood", "romantic pop", "acoustic"], "popularity": 87,
        "followers": {"total": 3400000},
        "external_urls": {"spotify": ""}
    },
    {
        "id": "sample_artist_7", "name": "Meera Kapoor", "type": "artist",
        "images": [{"url": "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&q=80&w=400", "height": 400, "width": 400}],
        "genres": ["bollywood", "romantic pop", "indie"], "popularity": 84,
        "followers": {"total": 2800000},
        "external_urls": {"spotify": ""}
    }
]

SAMPLE_ALBUMS = [
    {
        "id": "sample_album_1", "name": "Electric Dreams", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_1", "name": "Neon Pulse"}],
        "release_date": "2025-06-15", "total_tracks": 12,
        "tracks": {"items": []}
    },
    {
        "id": "sample_album_2", "name": "Midnight Serenade", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1619983081563-430f63602796?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_2", "name": "Luna Rivera"}],
        "release_date": "2025-09-22", "total_tracks": 10
    },
    {
        "id": "sample_album_3", "name": "Cosmic Drift", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1557672172-298e090bd0f1?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_3", "name": "Midnight Horizon"}],
        "release_date": "2025-11-01", "total_tracks": 8
    },
    {
        "id": "sample_album_4", "name": "No Limits", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_4", "name": "Kai Storm"}],
        "release_date": "2026-01-10", "total_tracks": 14
    },
    {
        "id": "sample_album_5", "name": "Soft Landing", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_5", "name": "Velvet Echo"}],
        "release_date": "2025-12-05", "total_tracks": 9
    },
    {
        "id": "sample_album_6", "name": "Neon Nights", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_1", "name": "Neon Pulse"}],
        "release_date": "2026-02-01", "total_tracks": 11
    },
    {
        "id": "sample_album_7", "name": "Dil Ki Roshni", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_6", "name": "Aarav Malhotra"}],
        "release_date": "2026-02-20", "total_tracks": 8
    },
    {
        "id": "sample_album_8", "name": "Chaand Aur Tum", "album_type": "album",
        "images": [{"url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=400"}],
        "artists": [{"id": "sample_artist_7", "name": "Meera Kapoor"}],
        "release_date": "2026-03-01", "total_tracks": 9
    }
]

def _make_track(id_suffix, name, artist_idx, album_idx, duration_ms=210000, preview_url=None, popularity=75):
    artist = SAMPLE_ARTISTS[artist_idx % len(SAMPLE_ARTISTS)]
    album = SAMPLE_ALBUMS[album_idx % len(SAMPLE_ALBUMS)]
    return {
        "id": f"sample_track_{id_suffix}",
        "name": name,
        "artists": [{"id": artist["id"], "name": artist["name"]}],
        "album": {
            "id": album["id"],
            "name": album["name"],
            "images": album["images"],
            "release_date": album["release_date"]
        },
        "duration_ms": duration_ms,
        "preview_url": preview_url,
        "popularity": popularity,
        "explicit": False,
        "external_urls": {"spotify": ""},
        "type": "track"
    }

SAMPLE_TRACKS = [
    _make_track("1", "Neon Lights", 0, 0, 234000, None, 88),
    _make_track("2", "Midnight Drive", 0, 0, 198000, None, 85),
    _make_track("3", "Velvet Sky", 1, 1, 246000, None, 82),
    _make_track("4", "Golden Hour", 1, 1, 215000, None, 79),
    _make_track("5", "Lost in Space", 2, 2, 267000, None, 76),
    _make_track("6", "Dream Catcher", 2, 2, 223000, None, 74),
    _make_track("7", "Run the City", 3, 3, 189000, None, 92),
    _make_track("8", "No Sleep", 3, 3, 201000, None, 89),
    _make_track("9", "Ocean Breeze", 4, 4, 312000, None, 68),
    _make_track("10", "Soft Rain", 4, 4, 278000, None, 65),
    _make_track("11", "Electric Soul", 0, 5, 245000, None, 86),
    _make_track("12", "Starlight", 1, 1, 220000, None, 80),
    _make_track("13", "Afterglow", 2, 2, 256000, None, 73),
    _make_track("14", "Crown", 3, 3, 192000, None, 91),
    _make_track("15", "Gentle Waves", 4, 4, 298000, None, 62),
    _make_track("16", "Cyber Rush", 0, 0, 210000, None, 84),
    _make_track("17", "Moonlit Dance", 1, 1, 235000, None, 77),
    _make_track("18", "Echoes", 2, 2, 289000, None, 71),
    _make_track("19", "Street Anthem", 3, 3, 178000, None, 88),
    _make_track("20", "Tranquility", 4, 4, 325000, None, 60),
    _make_track("21", "Dil Ki Baarish", 5, 6, 241000, None, 90),
    _make_track("22", "Teri Baatein", 5, 6, 228000, None, 88),
    _make_track("23", "Sajna Re", 5, 6, 236000, None, 86),
    _make_track("24", "Chaand Sa", 6, 7, 248000, None, 87),
    _make_track("25", "Palkein", 6, 7, 232000, None, 84),
    _make_track("26", "Ishq Wali Raat", 6, 7, 252000, None, 89),
]

MORNING_TRACKS = [t for t in SAMPLE_TRACKS if t["popularity"] >= 75]
AFTERNOON_TRACKS = [t for t in SAMPLE_TRACKS if "Ocean" in t["name"] or "Soft" in t["name"] or "Gentle" in t["name"] or "Tranquility" in t["name"] or "Dream" in t["name"] or "Lost" in t["name"] or "Echoes" in t["name"] or "Afterglow" in t["name"]]
EVENING_TRACKS = [t for t in SAMPLE_TRACKS if "Velvet" in t["name"] or "Golden" in t["name"] or "Moonlit" in t["name"] or "Starlight" in t["name"] or "Midnight" in t["name"]]
NIGHT_TRACKS = [t for t in SAMPLE_TRACKS if "Neon" in t["name"] or "Electric" in t["name"] or "Cyber" in t["name"] or "Run" in t["name"] or "No Sleep" in t["name"] or "Crown" in t["name"] or "Street" in t["name"]]
LATE_NIGHT_TRACKS = AFTERNOON_TRACKS

# Ensure all lists have enough tracks
for lst in [MORNING_TRACKS, AFTERNOON_TRACKS, EVENING_TRACKS, NIGHT_TRACKS, LATE_NIGHT_TRACKS]:
    while len(lst) < 12:
        lst.extend(SAMPLE_TRACKS[:12 - len(lst)])

SAMPLE_AUDIO_FEATURES = {
    "tempo": 128.0, "key": 5, "mode": 1, "time_signature": 4,
    "energy": 0.75, "danceability": 0.82, "valence": 0.65,
    "acousticness": 0.15, "instrumentalness": 0.02,
    "speechiness": 0.08, "liveness": 0.12
}

def get_sample_tracks_for_period(period):
    mapping = {
        "morning": MORNING_TRACKS,
        "afternoon": AFTERNOON_TRACKS,
        "evening": EVENING_TRACKS,
        "night": NIGHT_TRACKS,
        "late_night": LATE_NIGHT_TRACKS
    }
    return mapping.get(period, SAMPLE_TRACKS)[:12]

def search_sample_data(query, search_type="track", limit=20):
    q = query.lower()
    tokens = [token for token in re.split(r"[^a-z0-9]+", q) if len(token) > 2]

    def artist_genres(artist_id):
        artist = next((item for item in SAMPLE_ARTISTS if item["id"] == artist_id), None)
        return artist.get("genres", []) if artist else []

    def score_text_match(blob, genres):
        score = 0
        for token in tokens:
            if token in blob:
                score += 2
            if any(token in genre for genre in genres):
                score += 3
        if any(token in q for token in ["romantic", "romatic", "love", "dil", "ishq", "mohabbat", "pyaar"]):
            if any(genre in genres for genre in ["romantic pop", "bollywood"]):
                score += 6
        if "hindi" in q or "bollywood" in q or "desi" in q:
            if "bollywood" in genres:
                score += 6
        return score

    if search_type == "track" or search_type == "track,artist,album":
        scored_tracks = []
        for track in SAMPLE_TRACKS:
            genres = artist_genres(track["artists"][0]["id"])
            blob = " ".join([
                track["name"],
                track["artists"][0]["name"],
                track["album"]["name"],
                *genres,
            ]).lower()
            score = score_text_match(blob, genres)
            if q in blob:
                score += 8
            if score > 0:
                scored_tracks.append((score, track))
        tracks = [track for _, track in sorted(scored_tracks, key=lambda item: (-item[0], -(item[1].get("popularity", 0))))]
        if not tracks:
            tracks = SAMPLE_TRACKS[:limit]
        return {"tracks": {"items": tracks[:limit], "total": len(tracks)}}
    elif search_type == "artist":
        scored_artists = []
        for artist in SAMPLE_ARTISTS:
            blob = " ".join([artist["name"], *artist["genres"]]).lower()
            score = score_text_match(blob, artist["genres"])
            if q in blob:
                score += 8
            if score > 0:
                scored_artists.append((score, artist))
        artists = [artist for _, artist in sorted(scored_artists, key=lambda item: (-item[0], -(item[1].get("popularity", 0))))]
        if not artists:
            artists = SAMPLE_ARTISTS[:limit]
        return {"artists": {"items": artists[:limit], "total": len(artists)}}
    elif search_type == "album":
        scored_albums = []
        for album in SAMPLE_ALBUMS:
            genres = artist_genres(album["artists"][0]["id"])
            blob = " ".join([album["name"], album["artists"][0]["name"], *genres]).lower()
            score = score_text_match(blob, genres)
            if q in blob:
                score += 8
            if score > 0:
                scored_albums.append((score, album))
        albums = [album for _, album in sorted(scored_albums, key=lambda item: (-item[0], item[1].get("release_date", "")), reverse=False)]
        if not albums:
            albums = SAMPLE_ALBUMS[:limit]
        return {"albums": {"items": albums[:limit], "total": len(albums)}}
    return {"tracks": {"items": SAMPLE_TRACKS[:limit]}}

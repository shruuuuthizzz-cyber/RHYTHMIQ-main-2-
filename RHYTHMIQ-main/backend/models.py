import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

try:
    from .database import Base
except ImportError:
    from database import Base


def generate_uuid():
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = 'users'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(String(500), nullable=True)
    country = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    playlists = relationship('Playlist', back_populates='user', cascade='all, delete-orphan')
    likes = relationship('Like', back_populates='user', cascade='all, delete-orphan')
    ratings = relationship('Rating', back_populates='user', cascade='all, delete-orphan')
    history = relationship('ListeningHistory', back_populates='user', cascade='all, delete-orphan')
    dna_snapshots = relationship('DNASnapshot', back_populates='user', cascade='all, delete-orphan')
    email_verifications = relationship('EmailVerification', back_populates='user', cascade='all, delete-orphan')
    oauth_identities = relationship('OAuthIdentity', back_populates='user', cascade='all, delete-orphan')
    email_campaigns = relationship('EmailCampaign', back_populates='user', cascade='all, delete-orphan')
    login_history = relationship('UserLogin', back_populates='user', cascade='all, delete-orphan')
    sent_admin_recommendations = relationship(
        'AdminRecommendation',
        foreign_keys='AdminRecommendation.admin_user_id',
        back_populates='admin_user',
        cascade='all, delete-orphan',
    )
    received_admin_recommendations = relationship(
        'AdminRecommendation',
        foreign_keys='AdminRecommendation.target_user_id',
        back_populates='target_user',
        cascade='all, delete-orphan',
    )


class Playlist(Base):
    __tablename__ = 'playlists'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_public = Column(Boolean, default=True)
    cover_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='playlists')
    songs = relationship('PlaylistSong', back_populates='playlist', cascade='all, delete-orphan', order_by='PlaylistSong.position')


class PlaylistSong(Base):
    __tablename__ = 'playlist_songs'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    playlist_id = Column(String(36), ForeignKey('playlists.id', ondelete='CASCADE'), nullable=False, index=True)
    spotify_track_id = Column(String(100), nullable=False)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    album_name = Column(String(500), nullable=True)
    album_image = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    preview_url = Column(String(500), nullable=True)
    position = Column(Integer, default=0)
    added_at = Column(DateTime(timezone=True), default=utc_now)

    playlist = relationship('Playlist', back_populates='songs')


class Like(Base):
    __tablename__ = 'likes'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    spotify_track_id = Column(String(100), nullable=False, index=True)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    album_name = Column(String(500), nullable=True)
    album_image = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    preview_url = Column(String(500), nullable=True)
    liked_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='likes')


class Rating(Base):
    __tablename__ = 'ratings'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    spotify_track_id = Column(String(100), nullable=False, index=True)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    album_image = Column(String(500), nullable=True)
    stars = Column(Integer, nullable=False)
    rated_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='ratings')


class ListeningHistory(Base):
    __tablename__ = 'listening_history'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    spotify_track_id = Column(String(100), nullable=False)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    genre = Column(String(100), nullable=True)
    played_at = Column(DateTime(timezone=True), default=utc_now)
    play_duration = Column(Integer, default=0)
    skipped = Column(Boolean, default=False)

    user = relationship('User', back_populates='history')


class DNASnapshot(Base):
    __tablename__ = 'dna_snapshots'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    week = Column(String(20), nullable=False)
    genre_breakdown = Column(JSON, default=dict)
    mood_breakdown = Column(JSON, default=dict)
    top_artists = Column(JSON, default=list)
    calculated_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='dna_snapshots')


class EmailVerification(Base):
    __tablename__ = 'email_verifications'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='email_verifications')


class OAuthIdentity(Base):
    __tablename__ = 'oauth_identities'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)
    provider_user_id = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='oauth_identities')


class EmailCampaign(Base):
    __tablename__ = 'email_campaigns'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    campaign_type = Column(String(100), nullable=False, index=True)
    period_key = Column(String(20), nullable=True, index=True)
    payload = Column(JSON, default=dict)
    sent_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='email_campaigns')


class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    otp = Column(String(6), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User')


class LyraMessage(Base):
    __tablename__ = 'lyra_messages'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class UserLogin(Base):
    __tablename__ = 'user_logins'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    login_method = Column(String(50), nullable=False)  # 'email', 'google', 'github', etc.
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    logged_in_at = Column(DateTime(timezone=True), default=utc_now)

    user = relationship('User', back_populates='login_history')


class AdminRecommendation(Base):
    __tablename__ = 'admin_recommendations'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    admin_user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    target_user_id = Column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    spotify_track_id = Column(String(100), nullable=False, index=True)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    album_name = Column(String(500), nullable=True)
    album_image = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    preview_url = Column(String(500), nullable=True)
    source_type = Column(String(50), nullable=True)
    score = Column(Integer, nullable=True)
    note = Column(Text, nullable=True)
    recommended_at = Column(DateTime(timezone=True), default=utc_now)

    admin_user = relationship('User', foreign_keys=[admin_user_id], back_populates='sent_admin_recommendations')
    target_user = relationship('User', foreign_keys=[target_user_id], back_populates='received_admin_recommendations')

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { usePlayer } from '@/lib/PlayerContext';
import { adminAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { parseErrorDetail } from '@/lib/utils';
import {
  Activity,
  Clock,
  Heart,
  LogIn,
  LogOut,
  Mail,
  Music,
  Plus,
  Send,
  Shield,
  User,
  Users,
} from 'lucide-react';

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { queue, setQueue } = usePlayer();
  const [users, setUsers] = useState([]);
  const [statistics, setStatistics] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [recommendationGroups, setRecommendationGroups] = useState({
    listenerMatches: [],
    similarArtistTracks: [],
  });
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [sendingKey, setSendingKey] = useState('');
  const [databaseTables, setDatabaseTables] = useState([]);
  const [databaseMeta, setDatabaseMeta] = useState(null);

  const adminEmails = useMemo(
    () => (process.env.REACT_APP_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    [],
  );

  const isAdmin = user?.email && adminEmails.includes(user.email.toLowerCase());

  const usersById = useMemo(
    () => Object.fromEntries(users.map((entry) => [entry.id, entry])),
    [users],
  );

  const manageableStatistics = useMemo(
    () => statistics.filter((entry) => !usersById[entry.id]?.is_admin),
    [statistics, usersById],
  );

  const filteredUsers = useMemo(() => {
    const source = manageableStatistics;
    if (!search.trim()) {
      return source;
    }

    const lower = search.toLowerCase();
    return source.filter(
      (entry) =>
        entry.username.toLowerCase().includes(lower) ||
        entry.email.toLowerCase().includes(lower),
    );
  }, [manageableStatistics, search]);

  const selectedUser = useMemo(
    () => users.find((entry) => entry.id === selectedUserId),
    [users, selectedUserId],
  );

  const selectedStats = useMemo(
    () => statistics.find((entry) => entry.id === selectedUserId),
    [statistics, selectedUserId],
  );

  const selectedLoginHistory = useMemo(
    () => loginHistory.filter((entry) => entry.user_id === selectedUserId).slice(0, 8),
    [loginHistory, selectedUserId],
  );

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadAdminData();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedUserId) {
      setRecommendationGroups({
        listenerMatches: [],
        similarArtistTracks: [],
      });
      return;
    }
    loadCollaborativeRecommendations(selectedUserId);
  }, [isAdmin, selectedUserId]);

  const loadAdminData = async () => {
    setLoading(true);
    setError('');

    try {
      const [usersRes, statsRes, loginsRes, databaseRes] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getUserStatistics(),
        adminAPI.getLoginHistory(),
        adminAPI.getDatabaseTables(),
      ]);

      const nextUsers = usersRes.data || [];
      const nextStats = statsRes.data?.user_statistics || [];
      const nextLogins = loginsRes.data?.login_history || [];

      setUsers(nextUsers);
      setStatistics(nextStats);
      setLoginHistory(nextLogins);
      setDatabaseTables(databaseRes?.data?.tables || []);
      setDatabaseMeta(databaseRes?.data || null);

      const firstNonAdminWithTaste = nextStats.find((entry) => {
        const detail = nextUsers.find((candidate) => candidate.id === entry.id);
        return detail && !detail.is_admin && ((entry.likes_count || 0) > 0 || (entry.listening_history_count || 0) > 0);
      });

      const firstNonAdmin = nextStats.find((entry) => {
        const detail = nextUsers.find((candidate) => candidate.id === entry.id);
        return detail && !detail.is_admin;
      });

      setSelectedUserId((current) => current || firstNonAdminWithTaste?.id || firstNonAdmin?.id || nextStats[0]?.id || null);
    } catch (err) {
      console.error(err);
      const errorMsg = parseErrorDetail(err.response?.data?.detail) || 'Failed to load admin dashboard';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadCollaborativeRecommendations = async (userId) => {
    setLoadingRecommendations(true);
    try {
      const response = await adminAPI.getRecommendations(userId);
      setRecommendationGroups({
        listenerMatches: response.data?.listener_matches || response.data?.recommendations || [],
        similarArtistTracks: response.data?.similar_artist_tracks || [],
      });
    } catch (err) {
      console.error(err);
      setRecommendationGroups({
        listenerMatches: [],
        similarArtistTracks: [],
      });
      toast.error(parseErrorDetail(err.response?.data?.detail) || 'Failed to load collaborative recommendations');
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const addToQueue = (track) => {
    if (!track) {
      return;
    }

    const normalized = {
      id: track.spotify_track_id || track.id,
      name: track.track_name || track.name,
      artists: [{ name: track.artist_name || track.artists?.[0]?.name || '' }],
      album: { images: [{ url: track.album_image }] },
      preview_url: track.preview_url,
      duration_ms: track.duration_ms,
    };

    setQueue([...queue, normalized]);
    toast.success(`Queued ${normalized.name}`);
  };

  const upsertSavedRecommendation = (savedRecommendation) => {
    setUsers((currentUsers) =>
      currentUsers.map((entry) => {
        if (entry.id !== savedRecommendation.target_user_id) {
          return entry;
        }

        const existing = entry.received_recommendations || [];
        const nextRecommendations = [
          savedRecommendation,
          ...existing.filter(
            (item) => item.spotify_track_id !== savedRecommendation.spotify_track_id,
          ),
        ];

        return {
          ...entry,
          received_recommendations: nextRecommendations,
        };
      }),
    );
  };

  const sendRecommendation = async (track, targetUser, sourceType) => {
    if (!track || !targetUser) {
      return;
    }

    const requestKey = `${targetUser.id}:${track.spotify_track_id}`;
    setSendingKey(requestKey);

    try {
      const normalizedScore = Number.isFinite(Number(track.score)) ? Math.round(Number(track.score)) : null;
      const response = await adminAPI.sendRecommendation({
        target_user_id: targetUser.id,
        spotify_track_id: track.spotify_track_id,
        track_name: track.track_name,
        artist_name: track.artist_name,
        album_name: track.album_name,
        album_image: track.album_image,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url,
        source_type: sourceType,
        score: normalizedScore,
      });

      const savedRecommendation = response.data?.recommendation;
      if (savedRecommendation) {
        upsertSavedRecommendation(savedRecommendation);
      }

      if (targetUser.id === selectedUserId) {
        setRecommendationGroups((current) => ({
          listenerMatches: current.listenerMatches.filter(
            (item) => item.spotify_track_id !== track.spotify_track_id,
          ),
          similarArtistTracks: current.similarArtistTracks.filter(
            (item) => item.spotify_track_id !== track.spotify_track_id,
          ),
        }));
      }

      toast.success(`Recommended "${track.track_name}" to ${targetUser.username}`);
    } catch (err) {
      console.error(err);
      toast.error(parseErrorDetail(err.response?.data?.detail) || 'Failed to send recommendation');
    } finally {
      setSendingKey('');
    }
  };

  const formatDate = (value) => {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleSignOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const normalizeText = (value, fallback = '') => {
    if (typeof value === 'string') {
      return value;
    }

    if (value == null) {
      return fallback;
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizeText(item)).filter(Boolean).join(', ') || fallback;
    }

    if (typeof value === 'object') {
      return (
        value.msg
        || value.message
        || value.detail
        || value.reason
        || value.name
        || fallback
        || JSON.stringify(value)
      );
    }

    return String(value);
  };

  const renderRecommendationList = ({
    items,
    cardClassName,
    metaClassName,
    emptyMessage,
    sourceType,
    fallbackLabel,
  }) => {
    if (loadingRecommendations) {
      return <p className="text-sm text-muted-foreground">Finding recommendation matches...</p>;
    }

    if (!items.length) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }

    return (
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {items.map((recommendation) => {
          const currentKey = `${selectedUser.id}:${recommendation.spotify_track_id}`;
          const recommendedBy = Array.isArray(recommendation.recommended_by)
            ? recommendation.recommended_by.map((item) => normalizeText(item)).filter(Boolean)
            : [];
          const metaText = normalizeText(
            recommendation.reason
            || (recommendedBy.length ? `Similar users: ${recommendedBy.join(', ')}` : fallbackLabel),
            fallbackLabel,
          );

          return (
            <div key={recommendation.spotify_track_id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${cardClassName}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{normalizeText(recommendation.track_name, 'Unknown track')}</p>
                <p className="text-xs text-muted-foreground truncate">{normalizeText(recommendation.artist_name, 'Unknown artist')}</p>
                <p className={`text-xs truncate ${metaClassName}`}>{metaText}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => addToQueue(recommendation)} className="h-8 w-8 p-0">
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={sendingKey === currentKey}
                  onClick={() => sendRecommendation(recommendation, selectedUser, sourceType)}
                  className={`h-8 w-8 p-0 ${metaClassName}`}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isAdmin) {
    return (
      <div className="p-10">
        <div className="max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <Shield className="mx-auto mb-4 w-10 h-10 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground">Only approved RHYTHMIQ administrators can open this portal.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-syne font-extrabold text-4xl tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Admin Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review user login IDs, liked songs, collaborative matches, and send recommendations.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium">{user?.email}</p>
          </div>
          <Button onClick={loadAdminData} variant="secondary" className="gap-2">
            <Activity className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={handleSignOut} variant="outline" className="gap-2 border-white/10 bg-white/5 hover:bg-white/10">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {databaseMeta && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Connected Database Tables</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Current app database: {databaseMeta.backend}
                {databaseMeta.is_supabase_database ? ' (Supabase PostgreSQL)' : ' (local app database)'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Supabase project auth connection: {databaseMeta.supabase_project_connected ? 'configured' : 'not configured'}
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>{databaseMeta.table_count || 0} tables</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {databaseTables.map((table) => (
              <div key={table.name} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-medium">{table.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {table.columns?.length || 0} columns
                </p>
                <p className="text-xs text-muted-foreground mt-2 break-words">
                  {(table.columns || []).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex items-end gap-1 h-8">
            <div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px,1fr] gap-6">
          <aside className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                User Accounts
              </h2>
              <Input
                placeholder="Search by email or username"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="bg-white/5 border-white/10 mb-4"
              />

              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {filteredUsers.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedUserId(entry.id)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${
                      selectedUserId === entry.id
                        ? 'bg-primary/20 border border-primary/30'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.username}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.email}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{entry.logins_count} logins</p>
                        <p>{entry.likes_count} likes</p>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No matching user accounts.</p>
                )}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            {selectedUser ? (
              <>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold">{selectedUser.username}</h2>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Login ID: {selectedUser.email}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Joined {formatDate(selectedUser.created_at)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Logins</p>
                      <p className="text-2xl font-bold mt-2">{selectedStats?.logins_count || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Liked Songs</p>
                      <p className="text-2xl font-bold mt-2 text-red-400">{selectedUser.likes?.length || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Listening Events</p>
                      <p className="text-2xl font-bold mt-2 text-blue-400">{selectedStats?.listening_history_count || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin Picks Sent</p>
                      <p className="text-2xl font-bold mt-2 text-green-400">{selectedUser.received_recommendations?.length || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500" />
                      Liked Songs ({selectedUser.likes?.length || 0})
                    </h3>
                    {selectedUser.likes?.length ? (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {selectedUser.likes.map((like) => (
                          <div key={like.spotify_track_id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{normalizeText(like.track_name, 'Unknown track')}</p>
                              <p className="text-xs text-muted-foreground truncate">{normalizeText(like.artist_name, 'Unknown artist')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => addToQueue(like)} className="h-8 w-8 p-0">
                                <Plus className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedSong(like);
                                  setRecommendDialogOpen(true);
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No liked songs yet.</p>
                    )}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <LogIn className="w-5 h-5 text-cyan-400" />
                      Recent Login Activity
                    </h3>
                    {selectedLoginHistory.length ? (
                      <div className="space-y-3">
                        {selectedLoginHistory.map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{entry.email}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">{entry.login_method}</p>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                {formatDate(entry.logged_in_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No login history recorded yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Music className="w-5 h-5 text-purple-400" />
                      Collaborative Filtering
                    </h3>
                    {renderRecommendationList({
                      items: recommendationGroups.listenerMatches,
                      cardClassName: 'bg-purple-500/10 border-purple-500/20',
                      metaClassName: 'text-purple-300',
                      emptyMessage: 'No collaborative matches yet. This fills in after the user likes more songs.',
                      sourceType: 'collaborative_filter',
                      fallbackLabel: 'Picked from similar listeners',
                    })}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Music className="w-5 h-5 text-cyan-400" />
                      Similar Artist Suggestions
                    </h3>
                    {renderRecommendationList({
                      items: recommendationGroups.similarArtistTracks,
                      cardClassName: 'bg-cyan-500/10 border-cyan-500/20',
                      metaClassName: 'text-cyan-300',
                      emptyMessage: 'No artist-based suggestions yet. This fills in from the user listening taste and liked artists.',
                      sourceType: 'similar_artist',
                      fallbackLabel: 'Artist-based match',
                    })}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Send className="w-5 h-5 text-green-400" />
                      Recommendations Already Sent
                    </h3>
                    {selectedUser.received_recommendations?.length ? (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {selectedUser.received_recommendations.map((recommendation) => (
                          <div key={recommendation.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{normalizeText(recommendation.track_name, 'Unknown track')}</p>
                                <p className="text-xs text-muted-foreground truncate">{normalizeText(recommendation.artist_name, 'Unknown artist')}</p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <p>{normalizeText(recommendation.source_type, 'admin_pick')}</p>
                                <p>{formatDate(recommendation.recommended_at)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No admin recommendations have been sent to this user yet.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-20 bg-white/5 border border-white/10 rounded-2xl">
                <div className="text-center">
                  <User className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground">Select a user account to inspect activity and recommend music.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={recommendDialogOpen} onOpenChange={setRecommendDialogOpen}>
        <DialogContent className="bg-black border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-syne">Recommend Song to Another User</DialogTitle>
          </DialogHeader>

          {selectedSong && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-sm font-medium">{normalizeText(selectedSong.track_name, 'Unknown track')}</p>
                <p className="text-xs text-muted-foreground">{normalizeText(selectedSong.artist_name, 'Unknown artist')}</p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {users
                  .filter((entry) => !entry.is_admin && entry.id !== selectedUserId)
                  .map((entry) => {
                    const currentKey = `${entry.id}:${selectedSong.spotify_track_id}`;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={sendingKey === currentKey}
                        onClick={async () => {
                          await sendRecommendation(selectedSong, entry, 'liked_song');
                          setRecommendDialogOpen(false);
                        }}
                        className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-60"
                      >
                        <p className="text-sm font-medium">{entry.username}</p>
                        <p className="text-xs text-muted-foreground">{entry.email}</p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

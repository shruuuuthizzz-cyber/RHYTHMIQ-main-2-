import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, Library, BarChart3, MessageCircle, Settings, LogOut, Music2, Mic, Shield } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const adminEmails = (process.env.REACT_APP_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user?.email ? adminEmails.includes(user.email.toLowerCase()) : false;

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/search', icon: Search, label: 'Search' },
    { to: '/library', icon: Library, label: 'Library' },
    { to: '/dna', icon: BarChart3, label: 'Music DNA' },
    { to: '/lyra', icon: MessageCircle, label: 'LYRA AI' },
  ];

  if (isAdmin) {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin' });
  }

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const handleVoiceAI = () => {
    navigate('/lyra');
  };

  return (
    <aside data-testid="sidebar" className="w-64 fixed left-0 top-0 h-full border-r border-white/5 bg-black/95 backdrop-blur-xl z-40 hidden md:flex flex-col">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <Music2 className="w-5 h-5 text-black" />
        </div>
        <span className="font-syne font-extrabold text-xl tracking-tight">RHYTHMIQ</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3">
        <nav className="space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>

      {/* User section */}
      {user && (
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-black">
              {user.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.username}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="voice-ai-btn"
              onClick={handleVoiceAI}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors duration-200 w-full px-2 py-1.5"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice AI</span>
            </button>
            <button
              data-testid="logout-btn"
              onClick={handleLogout}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors duration-200 w-full px-2 py-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

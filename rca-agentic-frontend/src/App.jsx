import React, { useState, useEffect } from 'react';
import SelectionHub from './components/SelectionHub';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import OrchestratorView from './components/OrchestratorView';
import AgentforceView from './components/AgentforceView';
import MigrationView from './components/MigrationView';
import './MetaTheme.css';
import './App.css';

// ─── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#020306',
          color: '#f8fafc', fontFamily: 'monospace', padding: '2rem', gap: '1rem'
        }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ⚠ Runtime Error — Check Console
          </div>
          <div style={{ fontSize: 13, color: '#fca5a5', maxWidth: 700, wordBreak: 'break-all', textAlign: 'center' }}>
            {this.state.error?.toString()}
          </div>
          <pre style={{ fontSize: 10, color: '#94a3b8', maxWidth: 700, overflow: 'auto', textAlign: 'left', background: '#0f172a', padding: '1rem', borderRadius: 8, width: '100%' }}>
            {this.state.info?.componentStack}
          </pre>
          <button onClick={() => window.location.reload()} style={{
            padding: '0.5rem 1.5rem', background: '#6366f1', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12
          }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * MAIN APP COMPONENT
 * Manages the high-level routing and theme state.
 */
const App = () => {
  const [view, setView] = useState('selection'); // selection, dashboard, chat, agentforce
  const [selectedModule, setSelectedModule] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguage] = useState('en');

  // Sync theme with document class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    import('./config').then(({ config }) => {
      document.documentElement.setAttribute('data-theme', config.theme.toLowerCase());
    });
  }, []);

  const handleSelect = (module) => {
    setSelectedModule(module);
    setView('dashboard');
  };

  const handleLaunchChat = () => {
    setView('chat');
  };

  const handleLaunchAgentforce = () => {
    setView('agentforce');
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      {/* Global Background Layer */}
      <div className="mesh-bg opacity-20 dark:opacity-40">
        <div className="mesh-circle-1" />
        <div className="mesh-circle-2" />
      </div>

      {/* Main View Router */}
      <main className="relative z-10">
        {view === 'selection' && (
          <SelectionHub 
            onSelect={handleSelect} 
            isDark={isDark}
            setIsDark={setIsDark}
            language={language}
            setLanguage={setLanguage}
          />
        )}
        
        {view === 'dashboard' && (
          <Dashboard
            selectedModule={selectedModule}
            onLaunchChat={handleLaunchChat}
            onLaunchAgentforce={handleLaunchAgentforce}
            onBack={() => setView('selection')}
            onEditQuote={(id) => console.log('Edit quote', id)}
            language={language}
          />
        )}
        
        {view === 'chat' && (
          <OrchestratorView 
            onBack={() => setView('dashboard')} 
            selectedModule={selectedModule} 
            isDark={isDark} 
            setIsDark={setIsDark}
            language={language}
            setLanguage={setLanguage}
          />
        )}

        {view === 'agentforce' && selectedModule?.id !== 'migration' && (
          <AgentforceView 
            onBack={() => setView('dashboard')} 
            selectedModule={selectedModule} 
            isDark={isDark} 
            setIsDark={setIsDark}
            language={language}
            setLanguage={setLanguage}
          />
        )}

        {view === 'agentforce' && selectedModule?.id === 'migration' && (
          <MigrationView 
            onBack={() => setView('dashboard')} 
            selectedModule={selectedModule} 
            isDark={isDark} 
            setIsDark={setIsDark}
            language={language}
            setLanguage={setLanguage}
          />
        )}
      </main>
    </div>
  );
};

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}


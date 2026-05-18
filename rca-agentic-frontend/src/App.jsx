import React, { useState, useEffect } from 'react';
import SelectionHub from './components/SelectionHub';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import OrchestratorView from './components/OrchestratorView';
import AgentforceView from './components/AgentforceView';
import './MetaTheme.css';
import './App.css';

/**
 * MAIN APP COMPONENT
 * Manages the high-level routing and theme state.
 */
const App = () => {
  const [view, setView] = useState('selection'); // selection, dashboard, chat, agentforce
  const [selectedModule, setSelectedModule] = useState(null);
  const [isDark, setIsDark] = useState(false);

  // Sync theme with document class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

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
          <SelectionHub onSelect={handleSelect} isDark={isDark} setIsDark={setIsDark} />
        )}
        
        {view === 'dashboard' && (
          <Dashboard
            onLaunchChat={handleLaunchChat}
            onLaunchAgentforce={handleLaunchAgentforce}
            onBack={() => setView('selection')}
            onEditQuote={(id) => console.log('Edit quote', id)}
          />
        )}
        
        {view === 'chat' && (
          <OrchestratorView 
            onBack={() => setView('dashboard')} 
            selectedModule={selectedModule} 
            isDark={isDark} 
            setIsDark={setIsDark}
          />
        )}

        {view === 'agentforce' && (
          <AgentforceView 
            onBack={() => setView('dashboard')} 
            selectedModule={selectedModule} 
            isDark={isDark} 
            setIsDark={setIsDark}
          />
        )}
      </main>
    </div>
  );
};

export default App;

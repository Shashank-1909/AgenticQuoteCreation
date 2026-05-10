import React, { useState, useEffect } from 'react';
import SelectionHub from './components/SelectionHub';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import OrchestratorView from './components/OrchestratorView';
import './MetaTheme.css';
import './App.css';

/**
 * MAIN APP COMPONENT
 * Manages the high-level routing and theme state.
 */
const App = () => {
  const [view, setView] = useState('selection'); // selection, dashboard, chat
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

  const handleSelect = (moduleId) => {
    // Find full module object to ensure child components get titles/meta
    const modules = [
      { id: 'cpq', title: 'CPQ Orchestrator' },
      { id: 'rca', title: 'RCA Agentic Flow' },
      { id: 'oracle', title: 'Oracle ERP Bridge' }
    ];
    const moduleObj = modules.find(m => m.id === moduleId);
    setSelectedModule(moduleObj || { id: moduleId, title: 'Salesforce RCA' });
    setView('dashboard');
  };


  const handleLaunchChat = () => {
    setView('chat');
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      {/* Global Background Layer */}
      <div className="mesh-bg opacity-20 dark:opacity-40">
        <div className="mesh-circle-1" />
        <div className="mesh-circle-2" />
      </div>

      {view !== 'chat' && <ThemeToggle isDark={isDark} setIsDark={setIsDark} />}

      {/* Main View Router */}
      <main className="relative z-10">
        {view === 'selection' && (
          <SelectionHub onSelect={handleSelect} />
        )}
        
        {view === 'dashboard' && (
          <Dashboard
            onLaunchChat={handleLaunchChat}
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
      </main>
    </div>
  );
};

export default App;

 
import { useState } from 'react';
import { getStoredUser, clearSession, api } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import ChatScreen from './components/ChatScreen.jsx';

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });  
    } catch { 
    }
    clearSession();
    setUser(null);
  }

  if (!user) {
    return <AuthScreen onLoggedIn={setUser} />;
  }
  return <ChatScreen user={user} onLogout={handleLogout} />;
}

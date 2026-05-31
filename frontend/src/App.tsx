import { useState } from 'react';
import { tokens } from './api';
import Login from './pages/Login';
import Board from './pages/Board';

export default function App() {
  const [authed, setAuthed] = useState<boolean>(Boolean(tokens.access));

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <Board
      onLogout={() => {
        tokens.clear();
        setAuthed(false);
      }}
    />
  );
}

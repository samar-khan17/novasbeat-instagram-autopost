import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Queue from './pages/Queue.jsx';
import ImageEditor from './pages/ImageEditor.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1a1a2e', color: '#fff', border: '1px solid #2a2a44' },
          success: { iconTheme: { primary: '#2ecc71', secondary: '#1a1a2e' } },
          error: { iconTheme: { primary: '#e74c3c', secondary: '#1a1a2e' } },
        }}
      />
      <div className="flex min-h-screen bg-background text-white">
        <Sidebar />
        <main className="ml-[240px] flex-1 p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/editor" element={<ImageEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

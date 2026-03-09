import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SocketProvider } from './context/SocketContext'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'
import './index.css'

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  )
}

export default App

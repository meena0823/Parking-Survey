import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import UploadPage from './pages/UploadPage'
import DashboardPage from './pages/DashboardPage'
import DatabaseViewerPage from './pages/DatabaseViewerPage'

function App() {
    return (
        <Router>
            <div className="min-h-screen bg-surface-950 text-white font-sans">
                <Navbar />
                <main className="pt-16">
                    <Routes>
                        <Route path="/" element={<UploadPage />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/database" element={<DatabaseViewerPage />} />
                    </Routes>
                </main>
            </div>
        </Router>
    )
}

export default App

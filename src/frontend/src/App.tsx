import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProcessAnalysisPage from '@/pages/analise/ProcessAnalysisPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/analise" element={<ProcessAnalysisPage />} />
      </Routes>
    </BrowserRouter>
  )
}

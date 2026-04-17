import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ViewProvider } from '@/context/ViewContext'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProcessAnalysisPage from '@/pages/analise/ProcessAnalysisPage'
import FilaPage from '@/pages/processos/FilaPage'

export default function App() {
  return (
    <ViewProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<DashboardPage />} />
          <Route path="/processos" element={<FilaPage />} />
          <Route path="/analise"  element={<ProcessAnalysisPage />} />
        </Routes>
      </BrowserRouter>
    </ViewProvider>
  )
}

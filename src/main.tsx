import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Layout } from './components/Layout'
import { DemoModeProvider } from './lib/demoMode'
import { AboutPage } from './pages/About'
import { AdminPage } from './pages/Admin'
import { BomPage } from './pages/Bom'
import { FindPartsPage } from './pages/FindParts'
import { NotFound } from './pages/NotFound'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DemoModeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<FindPartsPage />} />
              <Route path="bom" element={<BomPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DemoModeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

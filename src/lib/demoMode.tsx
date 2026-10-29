import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const DemoCtx = createContext<{ demo: boolean; setDemo: (v: boolean) => void }>({ demo: false, setDemo: () => {} })

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(() => localStorage.getItem('partpilot.demo') === '1')
  useEffect(() => {
    localStorage.setItem('partpilot.demo', demo ? '1' : '0')
  }, [demo])
  return <DemoCtx.Provider value={{ demo, setDemo }}>{children}</DemoCtx.Provider>
}

export const useDemoMode = () => useContext(DemoCtx)

export function useApprover(): [string, (v: string) => void] {
  const [name, setName] = useState(() => localStorage.getItem('partpilot.approver') || 'Design engineer')
  useEffect(() => {
    localStorage.setItem('partpilot.approver', name)
  }, [name])
  return [name, setName]
}

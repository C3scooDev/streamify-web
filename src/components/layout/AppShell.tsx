'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { initRegistry, getAllProviders, getRepos, getRepoUrls } from '@/lib/registry'
import Nav from './Nav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { setProviders, setRepos, setRepoUrls } = useAppStore()

  useEffect(() => {
    initRegistry().then(() => {
      setProviders(getAllProviders())
      setRepos(getRepos())
      setRepoUrls(getRepoUrls())
    })
  }, [setProviders, setRepos, setRepoUrls])

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="pt-12">
        {children}
      </main>
    </div>
  )
}

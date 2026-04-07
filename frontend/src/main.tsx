import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AlephiumWalletProvider } from '@alephium/web3-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const network = (import.meta.env.VITE_ALEPHIUM_NETWORK ?? 'testnet') as
  | 'devnet'
  | 'testnet'
  | 'mainnet'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AlephiumWalletProvider network={network} theme="web95">
        <App />
      </AlephiumWalletProvider>
    </QueryClientProvider>
  </StrictMode>,
)

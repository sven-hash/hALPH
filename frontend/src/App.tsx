import { useCallback, useEffect, useMemo, useState } from 'react'
import { waitForTxConfirmation, web3 } from '@alephium/web3'
import { AlephiumConnectButton, useWallet } from '@alephium/web3-react'
import { CountdownGame } from '../../artifacts/ts/CountdownGame'
import type { CountdownGameTypes } from '../../artifacts/ts/CountdownGame'
import './App.css'

const envContractAddress = (import.meta.env.VITE_COUNTDOWN_CONTRACT_ADDRESS ?? '').trim()
const envNodeUrl = (import.meta.env.VITE_NODE_URL ?? 'https://node.testnet.alephium.org').trim()
const fetcher: typeof fetch = (input, init) => window.fetch(input, init)

function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function formatDuration(ms: bigint): string {
  if (ms <= 0n) return '0s'
  const second = 1000n
  const minute = 60n * second
  const hour = 60n * minute
  const day = 24n * hour
  const month = 30n * day
  const year = 365n * day

  let remaining = ms
  const years = remaining / year
  remaining %= year
  const months = remaining / month
  remaining %= month
  const days = remaining / day
  remaining %= day
  const hours = remaining / hour
  remaining %= hour
  const minutes = remaining / minute
  remaining %= minute
  const seconds = remaining / second

  const parts: string[] = []
  if (years > 0n) parts.push(`${years}y`)
  if (months > 0n) parts.push(`${months}mo`)
  if (days > 0n) parts.push(`${days}d`)
  if (hours > 0n) parts.push(`${hours}h`)
  if (minutes > 0n) parts.push(`${minutes}m`)
  if (seconds > 0n || parts.length === 0) parts.push(`${seconds}s`)

  return parts.slice(0, 4).join(' ')
}

function attoToAlph(atto: bigint): string {
  const base = 10n ** 18n
  const integer = atto / base
  const fraction = (atto % base).toString().padStart(18, '0').slice(0, 4)
  return `${integer.toString()}.${fraction}`
}

function App() {
  const [nodeUrl, setNodeUrl] = useState(envNodeUrl)
  const [status, setStatus] = useState<string>('')
  const [loadingState, setLoadingState] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState<CountdownGameTypes.Fields | null>(null)
  const [nowMs, setNowMs] = useState<bigint>(BigInt(Date.now()))
  const wallet = useWallet()

  const canPlay = useMemo(() => wallet !== undefined && envContractAddress.length > 0, [wallet])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(BigInt(Date.now())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const refreshState = useCallback(async () => {
    if (envContractAddress.length === 0) {
      setStatus('Set VITE_COUNTDOWN_CONTRACT_ADDRESS in frontend/.env and restart dev server.')
      return
    }

    setLoadingState(true)
    setStatus('')
    try {
      web3.setCurrentNodeProvider(nodeUrl, undefined, fetcher)
      const game = CountdownGame.at(envContractAddress)
      const nextState = await game.fetchState()
      setState(nextState.fields)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Failed to fetch state: ${message}`)
    } finally {
      setLoadingState(false)
    }
  }, [nodeUrl])

  useEffect(() => {
    if (envContractAddress.length === 0) return
    web3.setCurrentNodeProvider(nodeUrl, undefined, fetcher)
    const game = CountdownGame.at(envContractAddress)

    refreshState()

    const subscription = game.subscribeAllEvents({
      pollingInterval: 3000,
      messageCallback: async () => {
        await refreshState()
        return Promise.resolve()
      },
      errorCallback: async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`Event subscription error: ${message}`)
        return Promise.resolve()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [refreshState])

  const play = async () => {
    if (wallet === undefined) {
      setStatus('Connect a wallet before pressing play.')
      return
    }
    if (envContractAddress.length === 0) {
      setStatus('Set VITE_COUNTDOWN_CONTRACT_ADDRESS in frontend/.env and restart dev server.')
      return
    }

    setPlaying(true)
    setStatus('')
    try {
      web3.setCurrentNodeProvider(nodeUrl, undefined, fetcher)
      const game = CountdownGame.at(envContractAddress)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')

      const result = await game.transact.play({
        signer,
        attoAlphAmount: CountdownGame.consts.PLAY_COST
      })
      setStatus('Transaction submitted. Waiting for confirmation...')
      setConfirming(true)
      await waitForTxConfirmation(result.txId, 1, 1000)
      setStatus('Transaction confirmed.')
      await refreshState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Play failed: ${message}`)
    } finally {
      setConfirming(false)
      setPlaying(false)
    }
  }

  const timeLeftMs = useMemo(() => {
    if (state === null || !state.roundActive) return 0n
    if (state.deadlineMs <= nowMs) return 0n
    return state.deadlineMs - nowMs
  }, [state, nowMs])

  const projectedWinner = useMemo(() => (state === null ? 0n : (state.currentPot * 80n) / 100n), [state])
  const projectedNextSeed = useMemo(() => (state === null ? 0n : (state.currentPot * 10n) / 100n), [state])
  const projectedSavings = useMemo(() => (state === null ? 0n : state.currentPot - projectedWinner - projectedNextSeed), [state, projectedWinner, projectedNextSeed])

  return (
    <main className="app">
      <h1>Countdown Game</h1>
      <p className="subtitle">
        1 ALPH per play. Every press halves the timer. Last leader when timer reaches zero wins 80%.
      </p>

      <div className="panel">
        <label>
          Node URL
          <input
            value={nodeUrl}
            onChange={(e) => setNodeUrl(e.target.value)}
            placeholder="https://node.testnet.alephium.org"
          />
        </label>
        <p>Contract: <code>{envContractAddress || 'not set in frontend/.env'}</code></p>

        <div className="actions">
          <AlephiumConnectButton />
          <button onClick={refreshState} disabled={loadingState}>
            {loadingState ? 'Loading...' : 'Refresh'}
          </button>
          <button onClick={play} disabled={!canPlay || playing || confirming}>
            {playing ? 'Submitting...' : confirming ? 'Confirming...' : 'Play (1 ALPH)'}
          </button>
        </div>
      </div>

      {status.length > 0 && <p className="status">{status}</p>}

      <div className="panel">
        <h2>Live Game State</h2>
        {state === null ? (
          <p>No state loaded yet.</p>
        ) : (
          <div className="stats-grid">
            <div className="stat"><span className="label">Round</span><strong>{state.roundActive ? 'Active' : 'Waiting'}</strong></div>
            <div className="stat"><span className="label">Time left</span><strong className={timeLeftMs === 0n && state.roundActive ? 'danger' : ''}>{formatDuration(timeLeftMs)}</strong></div>
            <div className="stat"><span className="label">Leader</span><strong>{formatAddress(state.currentLeader)}</strong></div>
            <div className="stat"><span className="label">Current pot</span><strong>{attoToAlph(state.currentPot)} ALPH</strong></div>
            <div className="stat"><span className="label">Duration</span><strong>{formatDuration(state.currentDurationMs)}</strong></div>
            <div className="stat"><span className="label">Savings pot</span><strong>{attoToAlph(state.savingsPot)} ALPH</strong></div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Projected Payout (if timer ends now)</h2>
        <div className="split-grid">
          <div><span>Winner (80%)</span><strong>{attoToAlph(projectedWinner)} ALPH</strong></div>
          <div><span>Next round seed (10%)</span><strong>{attoToAlph(projectedNextSeed)} ALPH</strong></div>
          <div><span>Savings (10%)</span><strong>{attoToAlph(projectedSavings)} ALPH</strong></div>
        </div>
      </div>
    </main>
  )
}

export default App

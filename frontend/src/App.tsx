import { useEffect, useMemo, useState } from 'react'
import { waitForTxConfirmation, web3 } from '@alephium/web3'
import { AlephiumConnectButton, useBalance, useWallet } from '@alephium/web3-react'
import { CountdownGame } from '../../artifacts/ts/CountdownGame'
import type { CountdownGameTypes } from '../../artifacts/ts/CountdownGame'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'

const DEFAULT_CONTRACT = '26NmnTSsUjkwA4ArkQkUsmiJC81tHCvWUrWh9eVxXf8ZM'
const DEFAULT_NODE_URL = 'https://node.testnet.alephium.org'
const CONTRACT_ADDRESS = (import.meta.env.VITE_COUNTDOWN_CONTRACT_ADDRESS ?? DEFAULT_CONTRACT).trim()
const NODE_URL = (import.meta.env.VITE_NODE_URL ?? DEFAULT_NODE_URL).trim() || DEFAULT_NODE_URL
const fetcher: typeof fetch = (input, init) => window.fetch(input, init)

type PlayFeedItem = {
  id: string
  player: string
  durationMs: bigint
}

function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
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

function msToDhm(ms: bigint): string {
  if (ms <= 0n) return '0d 0h 0m 0s'
  const second = 1000n
  const minute = 60n * second
  const hour = 60n * minute
  const day = 24n * hour

  let remaining = ms
  const days = remaining / day
  remaining %= day
  const hours = remaining / hour
  remaining %= hour
  const minutes = remaining / minute
  remaining %= minute
  const seconds = remaining / second
  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

function msToYdhms(ms: bigint): string {
  if (ms <= 0n) return '00y 000d 00h 00m 00s'
  const second = 1000n
  const minute = 60n * second
  const hour = 60n * minute
  const day = 24n * hour
  const year = 365n * day

  let remaining = ms
  const years = remaining / year
  remaining %= year
  const days = remaining / day
  remaining %= day
  const hours = remaining / hour
  remaining %= hour
  const minutes = remaining / minute
  remaining %= minute
  const seconds = remaining / second

  const yy = years.toString().padStart(2, '0')
  const dd = days.toString().padStart(3, '0')
  const hh = hours.toString().padStart(2, '0')
  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  return `${yy}y ${dd}d ${hh}h ${mm}m ${ss}s`
}

function getHalvedCount(durationMs: bigint): number {
  const initial = CountdownGame.consts.INITIAL_DURATION_MS
  if (durationMs <= 0n || durationMs > initial) return 0
  let count = 0
  let probe = initial
  while (probe > durationMs) {
    probe = probe / 2n
    if (probe == 0n) break
    count += 1
  }
  return count
}

function App() {
  const [status, setStatus] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [nowMs, setNowMs] = useState<bigint>(BigInt(Date.now()))
  const [feed, setFeed] = useState<PlayFeedItem[]>([])
  const wallet = useWallet()
  const { balance, updateBalanceForTx } = useBalance()

  const canPlay = useMemo(() => wallet !== undefined && CONTRACT_ADDRESS.length > 0, [wallet])
  const walletAddress = wallet?.account?.address
  const playCost = CountdownGame.consts.PLAY_COST
  const availableAlph = BigInt(balance?.balance ?? '0')
  const hasEnoughAlph = availableAlph >= playCost

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(BigInt(Date.now())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (CONTRACT_ADDRESS.length === 0) return
    web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
    const game = CountdownGame.at(CONTRACT_ADDRESS)

    const sub = game.subscribePlayedEvent({
      pollingInterval: 2500,
      messageCallback: async (event: CountdownGameTypes.PlayedEvent) => {
        setFeed((prev) =>
          [
            {
              id: event.txId,
              player: event.fields.player,
              durationMs: event.fields.durationMs
            },
            ...prev
          ].slice(0, 8)
        )
        return Promise.resolve()
      },
      errorCallback: async () => Promise.resolve()
    })

    return () => sub.unsubscribe()
  }, [])

  const { data: state, isLoading } = useQuery<CountdownGameTypes.Fields>({
    queryKey: ['countdown-state', NODE_URL, CONTRACT_ADDRESS],
    queryFn: async () => {
      if (CONTRACT_ADDRESS.length === 0) {
        throw new Error('Missing contract address')
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const game = CountdownGame.at(CONTRACT_ADDRESS)
      const nextState = await game.fetchState()
      return nextState.fields
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const walletBalance = useMemo(() => attoToAlph(availableAlph), [availableAlph])

  const play = async () => {
    if (wallet === undefined) {
      setStatus('Connect wallet to play.')
      return
    }
    if (!hasEnoughAlph) {
      setStatus(`Not enough ALPH. You need at least ${attoToAlph(playCost)} ALPH to play.`)
      return
    }
    if (CONTRACT_ADDRESS.length === 0) {
      setStatus('Missing contract address in env.')
      return
    }
    setPlaying(true)
    setStatus('')
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const game = CountdownGame.at(CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')

      const result = await game.transact.play({
        signer,
        attoAlphAmount: CountdownGame.consts.PLAY_COST
      })
      updateBalanceForTx(result.txId)
      setStatus('Submitted. Waiting for confirmation...')
      setConfirming(true)
      await waitForTxConfirmation(result.txId, 1, 1000)
      setStatus('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Play failed: ${message}`)
    } finally {
      setConfirming(false)
      setPlaying(false)
    }
  }

  const timeLeftMs = useMemo(() => {
    if (!state || !state.roundActive) return 0n
    if (state.deadlineMs <= nowMs) return 0n
    return state.deadlineMs - nowMs
  }, [state, nowMs])

  const pot = state?.currentPot ?? 0n
  const prizePot = (pot * 80n) / 100n
  const nextRoundSeed = (pot * 10n) / 100n
  const savingsPot = state?.savingsPot ?? 0n
  const halvedCount = state ? getHalvedCount(state.currentDurationMs) : 0
  const urgencyClass = useMemo(() => {
    if (!state?.roundActive || state.currentDurationMs === 0n) return 'text-emerald-400'
    const percent = Number((timeLeftMs * 100n) / state.currentDurationMs)
    if (percent < 15) return 'text-red-400'
    if (percent < 45) return 'text-yellow-300'
    return 'text-emerald-400'
  }, [state, timeLeftMs])
  const isExpired = Boolean(state?.roundActive && timeLeftMs === 0n)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-screen w-full max-w-5xl flex-col px-4 py-4">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-black tracking-[0.2em] text-emerald-300">HALF LIFE</div>
            <div className="text-xs text-slate-400">Timer-halving survival game</div>
          </div>
          <div className="flex items-center gap-2">
            {walletAddress && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {formatAddress(walletAddress)} · {walletBalance ?? '--'} ALPH
              </div>
            )}
            <AlephiumConnectButton />
          </div>
        </header>

        {status.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {status}
          </div>
        )}

        <main className="flex flex-1 flex-col gap-4">
          <section className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
            <p className="mb-3 text-sm text-slate-400">Each play halves the timer and makes you leader.</p>
            <div className="min-h-[120px] text-center md:min-h-[170px]">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={state ? state.currentDurationMs.toString() : 'empty'}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className={`text-4xl font-extrabold tracking-tight md:text-7xl ${urgencyClass} ${state?.roundActive ? 'animate-pulse' : ''}`}
                >
                  {isLoading ? '--' : msToYdhms(timeLeftMs)}
                </motion.div>
              </AnimatePresence>
              <div className="mt-2 text-xs text-slate-500">Halved {halvedCount} times</div>
            </div>

            <div className="mt-2 w-full max-w-md rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-center">
              <div className="text-xs uppercase tracking-widest text-emerald-300">Current Pot</div>
              <div className="mt-1 text-3xl font-extrabold text-emerald-200 md:text-4xl">
                {attoToAlph(pot)} ALPH
              </div>
            </div>

            {isExpired && (
              <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                GAME OVER — {state ? formatAddress(state.currentLeader) : '--'} won {attoToAlph(prizePot)} ALPH. Next round starts on next play.
              </div>
            )}

            <button
              onClick={play}
              disabled={!canPlay || playing || confirming || !hasEnoughAlph}
              className="mt-8 w-full max-w-md rounded-2xl bg-emerald-500 px-6 py-5 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 md:text-xl disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!walletAddress
                ? 'CONNECT WALLET FIRST'
                : !hasEnoughAlph
                  ? 'NOT ENOUGH ALPH'
                : playing
                  ? 'Submitting...'
                  : confirming
                    ? 'Confirming...'
                    : 'PLAY — 1 ALPH'}
            </button>
            {walletAddress && !hasEnoughAlph && (
              <div className="mt-2 text-xs text-amber-300">
                You need at least {attoToAlph(playCost)} ALPH available.
              </div>
            )}
            <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-slate-100 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
              👑 Current Leader: {state ? formatAddress(state.currentLeader) : '--'}
            </div>

            <div className="mt-4 grid w-full max-w-xl grid-cols-1 gap-2 text-center sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="text-[11px] text-slate-400">Prize Pot (80%)</div>
                <div className="text-sm font-semibold">{attoToAlph(prizePot)} ALPH</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="text-[11px] text-slate-400">Next Round Seed (10%)</div>
                <div className="text-sm font-semibold">{attoToAlph(nextRoundSeed)} ALPH</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="text-[11px] text-slate-400">Savings Pot (10%)</div>
                <div className="text-sm font-semibold">{attoToAlph(savingsPot)} ALPH</div>
              </div>
            </div>
          </section>

          <section className="flex min-h-[180px] flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-widest text-slate-400">RECENT PLAYS</h2>
              <span className="text-xs text-slate-500">{feed.length} items</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {feed.length === 0 ? (
                <p className="text-sm text-slate-500">No plays yet.</p>
              ) : (
                feed.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <div className="text-sm text-slate-200">
                      {formatAddress(item.player)} halved the timer
                    </div>
                    <div className="text-xs text-slate-400">→ {msToYdhms(item.durationMs)} remaining</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>

        {(playing || confirming) && (
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-slate-950/70 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
              <div className="font-semibold text-slate-100">
                {playing ? 'Submitting transaction...' : 'Waiting for confirmation...'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

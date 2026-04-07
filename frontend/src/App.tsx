import { useEffect, useMemo, useState } from 'react'
import { waitForTxConfirmation, web3 } from '@alephium/web3'
import { AlephiumConnectButton, useBalance, useWallet } from '@alephium/web3-react'
import { CountdownGame } from '../../artifacts/ts/CountdownGame'
import type { CountdownGameTypes } from '../../artifacts/ts/CountdownGame'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Zap } from 'lucide-react'
import deploymentsData from '../../deployments/.deployments.testnet.json'

function getContractAddressFromDeployments(): string | undefined {
  for (const deployment of deploymentsData) {
    const countdownGame = deployment.contracts?.CountdownGame
    if (countdownGame?.contractInstance?.address) {
      return countdownGame.contractInstance.address
    }
  }
  return undefined
}

const DEFAULT_NODE_URL = 'https://node.testnet.alephium.org'
const CONTRACT_ADDRESS = import.meta.env.VITE_COUNTDOWN_CONTRACT_ADDRESS?.trim() || getContractAddressFromDeployments() || ''
const NODE_URL = (import.meta.env.VITE_NODE_URL ?? DEFAULT_NODE_URL).trim() || DEFAULT_NODE_URL
const fetcher: typeof fetch = (input, init) => window.fetch(input, init)

function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function attoToAlph(atto: bigint, decimals: number = 4): string {
  const base = 10n ** 18n
  const integer = atto / base
  const fraction = (atto % base).toString().padStart(18, '0').slice(0, decimals)
  return `${integer.toString()}.${fraction}`
}

type TimerPart = { value: string; unit: string }

function msToTimerParts(ms: bigint): TimerPart[] {
  if (ms <= 0n) {
    return [{ value: '0', unit: 's' }]
  }
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

  const parts: TimerPart[] = []
  let started = false

  if (years > 0n) {
    parts.push({ value: years.toString(), unit: 'y' })
    started = true
  }
  if (days > 0n || started) {
    parts.push({ value: days.toString(), unit: 'd' })
    started = true
  }
  if (hours > 0n || started) {
    parts.push({ value: hours.toString().padStart(2, '0'), unit: 'h' })
    started = true
  }
  if (minutes > 0n || started) {
    parts.push({ value: minutes.toString().padStart(2, '0'), unit: 'm' })
    started = true
  }
  parts.push({ value: seconds.toString().padStart(2, '0'), unit: 's' })

  return parts
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

function LaurelWreath({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 50" className={className} fill="currentColor">
      <path d="M50 45 C35 45 22 38 15 28 C20 32 28 34 36 32 C28 34 22 30 18 24 C23 28 32 30 40 27 C32 29 25 25 22 19 C27 23 36 25 44 21 C36 23 30 19 28 14 C33 17 40 18 47 15 C41 17 37 14 36 10 C40 12 45 12 50 10" strokeWidth="1.5" stroke="currentColor" fill="none"/>
      <path d="M50 45 C65 45 78 38 85 28 C80 32 72 34 64 32 C72 34 78 30 82 24 C77 28 68 30 60 27 C68 29 75 25 78 19 C73 23 64 25 56 21 C64 23 70 19 72 14 C67 17 60 18 53 15 C59 17 63 14 64 10 C60 12 55 12 50 10" strokeWidth="1.5" stroke="currentColor" fill="none"/>
    </svg>
  )
}

function RomanColumn({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`hidden lg:flex flex-col items-center ${side === 'left' ? 'mr-4' : 'ml-4'}`}>
      {/* Capital */}
      <div className="w-16 h-8 bg-gradient-to-b from-stone-200 to-stone-300 rounded-t-sm border-b-4 border-stone-400 shadow-inner" />
      {/* Hourglass decoration */}
      <div className="w-12 h-20 my-2 flex items-center justify-center">
        <svg viewBox="0 0 40 60" className="w-10 h-16 text-stone-400">
          <path d="M8 5 L32 5 L32 8 L28 8 L20 25 L28 42 L32 42 L32 55 L8 55 L8 42 L12 42 L20 25 L12 8 L8 8 Z" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M14 10 L26 10 L20 22 Z" fill="currentColor" opacity="0.3"/>
          <path d="M14 50 L26 50 L20 38 Z" fill="currentColor" opacity="0.5"/>
        </svg>
      </div>
      {/* Shaft */}
      <div className="w-12 flex-1 min-h-[200px] bg-gradient-to-r from-stone-300 via-stone-100 to-stone-300 shadow-lg" style={{ backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />
      {/* Base */}
      <div className="w-20 h-6 bg-gradient-to-t from-stone-300 to-stone-200 rounded-b-sm border-t-2 border-stone-400" />
    </div>
  )
}

function App() {
  const [status, setStatus] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [playingDouble, setPlayingDouble] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [nowMs, setNowMs] = useState<bigint>(BigInt(Date.now()))
  const wallet = useWallet()
  const { balance, updateBalanceForTx } = useBalance()

  const walletAddress = wallet?.account?.address
  const availableAlph = BigInt(balance?.balance ?? '0')

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(BigInt(Date.now())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (CONTRACT_ADDRESS.length === 0) return
    web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
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

  const basePlayCost = state?.basePlayCost ?? 5n * 10n ** 18n
  const currentPlayCost = state?.roundActive ? state.currentPlayCost : basePlayCost
  const doublePlayCost = currentPlayCost * 2n
  const canPlay = wallet !== undefined && CONTRACT_ADDRESS.length > 0
  const hasEnoughForSingle = availableAlph >= currentPlayCost
  const hasEnoughForDouble = availableAlph >= doublePlayCost
  const isRoundActive = state?.roundActive ?? false

  const play = async (isDouble: boolean = false) => {
    if (wallet === undefined) {
      setStatus('Connect your Alephium wallet to enter the arena.')
      return
    }
    const cost = isDouble ? doublePlayCost : currentPlayCost
    const hasEnough = isDouble ? hasEnoughForDouble : hasEnoughForSingle
    if (!hasEnough) {
      setStatus(`Insufficient tribute. You need at least ${attoToAlph(cost, 2)} ALPH.`)
      return
    }
    if (isDouble && !isRoundActive) {
      setStatus('Double play is only available during an active round.')
      return
    }
    if (CONTRACT_ADDRESS.length === 0) {
      setStatus('Missing contract address.')
      return
    }
    
    if (isDouble) {
      setPlayingDouble(true)
    } else {
      setPlaying(true)
    }
    setStatus('')
    
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const game = CountdownGame.at(CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')

      const result = isDouble
        ? await game.transact.playDouble({
            signer,
            attoAlphAmount: doublePlayCost
          })
        : await game.transact.play({
            signer,
            attoAlphAmount: currentPlayCost
          })
      
      updateBalanceForTx(result.txId)
      setStatus('Transaction submitted. Awaiting confirmation...')
      setConfirming(true)
      await waitForTxConfirmation(result.txId, 1, 1000)
      setStatus('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Failed: ${message}`)
    } finally {
      setConfirming(false)
      setPlaying(false)
      setPlayingDouble(false)
    }
  }

  const timeLeftMs = useMemo(() => {
    if (!state || !state.roundActive) return 0n
    if (state.deadlineMs <= nowMs) return 0n
    return state.deadlineMs - nowMs
  }, [state, nowMs])

  const timerParts = useMemo(() => msToTimerParts(timeLeftMs), [timeLeftMs])
  const pot = state?.currentPot ?? 0n
  const prizePot = (pot * 80n) / 100n
  const savingsPot = state?.savingsPot ?? 0n
  const totalSavings = savingsPot + (pot * 20n) / 100n
  const halvedCount = state ? getHalvedCount(state.currentDurationMs) : 0
  const isExpired = Boolean(state?.roundActive && timeLeftMs === 0n)
  const isBusy = playing || playingDouble || confirming

  return (
    <div className="marble-bg min-h-screen">
      {/* Header */}
      <header className="absolute top-4 right-4 z-10">
        <AlephiumConnectButton />
      </header>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-8">
        
        {/* Laurel & Title */}
        <div className="mb-8 flex flex-col items-center text-center">
          <LaurelWreath className="mb-2 h-12 w-24 text-[#C9A227]" />
          <h1 className="font-roman text-4xl font-semibold tracking-wide text-[#1C1C1C] sm:text-5xl md:text-6xl">
            THE <span className="lowercase">h</span>ALPHING
          </h1>
          <p className="mt-2 text-base font-light italic tracking-wide text-[#1C1C1C]/60 sm:text-lg">
            Timer-halving survival game
          </p>
        </div>

        {/* Main Game Section with Columns */}
        <div className="flex w-full items-stretch justify-center">
          <RomanColumn side="left" />
          
          {/* Dark Marble Frame */}
          <div className="dark-marble-frame relative w-full max-w-xl overflow-hidden rounded-sm border-4 border-[#8B7355] shadow-2xl">
            {/* Inner cream/white content area */}
            <div className="relative bg-[#F5F0E8] px-6 py-8 sm:px-10 sm:py-10">
              
              {/* Current Emperor */}
              <div className="mb-6 flex flex-col items-center">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium italic text-[#1C1C1C]/70">
                  <span>Current Emperor</span>
                  <Crown size={16} strokeWidth={1.5} className="text-[#C9A227]" />
                </div>
                <p className="font-mono text-sm text-[#1C1C1C]/80">
                  {isLoading ? '...' : state ? formatAddress(state.currentLeader) : '—'}
                </p>
              </div>

              {/* Timer */}
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={state ? state.currentDurationMs.toString() : 'empty'}
                  initial={{ scale: 1.02, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.98, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="mb-4 text-center"
                >
                  <div className="font-roman text-4xl font-bold tracking-wide text-[#1C1C1C] sm:text-5xl md:text-6xl">
                    {timerParts.map((part, i) => (
                      <span key={part.unit}>
                        <span>{part.value}</span>
                        <span className="text-2xl font-normal text-[#1C1C1C]/50 sm:text-3xl">{part.unit}</span>
                        {i < timerParts.length - 1 && ' '}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
              
              <p className="mb-8 text-center text-sm italic text-[#1C1C1C]/60">
                Halved {halvedCount} times
              </p>

              {/* Opulentia & Tributum */}
              <div className="mb-8 grid grid-cols-2 gap-6">
                <div className="text-center">
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-[#C9A227]">
                    Opulentia
                  </p>
                  <p className="font-roman text-2xl font-semibold text-[#1C1C1C] sm:text-3xl">
                    {attoToAlph(pot, 2)}
                  </p>
                  <p className="text-sm text-[#1C1C1C]/60">ALPH</p>
                </div>
                <div className="text-center">
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-[#1C1C1C]/70">
                    Tributum
                  </p>
                  <p className="font-roman text-2xl font-semibold text-[#1C1C1C] sm:text-3xl">
                    {attoToAlph(currentPlayCost, 2)}
                  </p>
                  <p className="text-sm text-[#1C1C1C]/60">ALPH</p>
                  <p className="mt-0.5 text-[10px] italic text-[#1C1C1C]/40">Current Entry Fee</p>
                </div>
              </div>

              {/* Status Message */}
              {status.length > 0 && (
                <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
                  {status}
                </div>
              )}

              {/* Expired State */}
              {isExpired && (
                <div className="mb-4 rounded border border-[#C9A227]/40 bg-[#C9A227]/10 px-4 py-3 text-center text-sm text-[#1C1C1C]">
                  <span className="font-semibold">Victory!</span> {state ? formatAddress(state.currentLeader) : '—'} claims {attoToAlph(prizePot, 2)} ALPH.
                </div>
              )}

              {/* Play Buttons */}
              <div className="space-y-3">
                {/* Single Play Button */}
                <button
                  onClick={() => play(false)}
                  disabled={!canPlay || isBusy || !hasEnoughForSingle}
                  className="mx-auto block w-full max-w-xs rounded-sm border-2 border-[#8B7355] bg-transparent px-8 py-3 font-roman text-sm font-semibold uppercase tracking-[0.2em] text-[#1C1C1C] transition-all duration-200 hover:bg-[#8B7355]/10 focus:outline-none focus:ring-2 focus:ring-[#8B7355]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  {!walletAddress
                    ? 'Connect to Enter'
                    : !hasEnoughForSingle
                      ? 'Insufficient Tribute'
                      : playing
                        ? 'Submitting...'
                        : confirming && !playingDouble
                          ? 'Confirming...'
                          : `Enter the Arena — ${attoToAlph(currentPlayCost, 2)}`}
                </button>

                {/* Double Play Button - only show during active round */}
                {isRoundActive && !isExpired && (
                  <button
                    onClick={() => play(true)}
                    disabled={!canPlay || isBusy || !hasEnoughForDouble}
                    className="mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-sm border-2 border-[#C9A227] bg-[#C9A227]/10 px-8 py-3 font-roman text-sm font-semibold uppercase tracking-[0.2em] text-[#1C1C1C] transition-all duration-200 hover:bg-[#C9A227]/20 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                  >
                    <Zap size={16} className="text-[#C9A227]" />
                    {!walletAddress
                      ? 'Connect First'
                      : !hasEnoughForDouble
                        ? 'Need More ALPH'
                        : playingDouble
                          ? 'Submitting...'
                          : confirming && playingDouble
                            ? 'Confirming...'
                            : `Double Down — ${attoToAlph(doublePlayCost, 2)}`}
                  </button>
                )}
                
                {isRoundActive && !isExpired && (
                  <p className="text-center text-[10px] italic text-[#1C1C1C]/50">
                    Double down halves the timer twice (÷4)
                  </p>
                )}
              </div>

              {/* Connect Alephium text */}
              {!walletAddress && (
                <p className="mt-3 text-center text-xs uppercase tracking-wider text-[#1C1C1C]/50">
                  Connect Alephium Wallet
                </p>
              )}
              
              {walletAddress && !hasEnoughForSingle && (
                <p className="mt-3 text-center text-xs text-[#1C1C1C]/50">
                  You need at least {attoToAlph(currentPlayCost, 2)} ALPH to enter.
                </p>
              )}
            </div>
          </div>
          
          <RomanColumn side="right" />
        </div>

        {/* Prize & Savings Pots */}
        <div className="mt-8 w-full max-w-xl">
          {/* Gold divider */}
          <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-[#C9A227]/60 to-transparent" />
          
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">
                Prize Pot (80%)
              </p>
              <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">
                {attoToAlph(prizePot, 2)}
              </p>
              <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
            </div>
            <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">
                Savings Pot (20%)
              </p>
              <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">
                {attoToAlph(totalSavings, 2)}
              </p>
              <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto pt-8 text-center text-[10px] text-[#1C1C1C]/30">
          Built on Alephium
        </footer>
      </div>

      {/* Loading Overlay */}
      {isBusy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#FAF9F6]/90 backdrop-blur-sm">
          <div className="rounded-sm border-2 border-[#8B7355] bg-white px-10 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-[#C9A227] border-t-transparent" />
            <p className="font-roman text-lg font-medium text-[#1C1C1C]">
              {(playing || playingDouble) ? (playingDouble ? 'Submitting double tribute...' : 'Submitting tribute...') : 'Awaiting confirmation...'}
            </p>
            <p className="mt-1 text-sm text-[#1C1C1C]/50">
              Please wait
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

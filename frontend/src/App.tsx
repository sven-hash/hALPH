import { useEffect, useMemo, useState } from 'react'
import { validateAddress, waitForTxConfirmation, web3 } from '@alephium/web3'
import { AlephiumConnectButton, useBalance, useWallet, useConnect } from '@alephium/web3-react'
import { CountdownGame } from '../../artifacts/ts/CountdownGame'
import { CountdownBettingMarket } from '../../artifacts/ts/CountdownBettingMarket'
import type { CountdownGameTypes } from '../../artifacts/ts/CountdownGame'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Zap } from 'lucide-react'
import deploymentsData from '../../deployments/.deployments.testnet.json'

function getDeploymentsArray() {
  return Array.isArray(deploymentsData) ? deploymentsData : [deploymentsData]
}

function getContractAddressFromDeployments(): string | undefined {
  for (const deployment of getDeploymentsArray()) {
    const countdownGame = deployment.contracts?.CountdownGame
    if (countdownGame?.contractInstance?.address) {
      return countdownGame.contractInstance.address
    }
  }
  return undefined
}

function getBettingContractAddressFromDeployments(): string | undefined {
  for (const deployment of getDeploymentsArray()) {
    const contracts = deployment.contracts as Record<string, { contractInstance?: { address?: string } }> | undefined
    const betting = contracts?.CountdownBettingMarket
    if (betting?.contractInstance?.address) {
      return betting.contractInstance.address
    }
  }
  return undefined
}

const DEFAULT_NODE_URL = 'https://node.testnet.alephium.org'
const CONTRACT_ADDRESS = import.meta.env.VITE_COUNTDOWN_CONTRACT_ADDRESS?.trim() || getContractAddressFromDeployments() || ''
const BETTING_CONTRACT_ADDRESS =
  import.meta.env.VITE_BETTING_CONTRACT_ADDRESS?.trim() || getBettingContractAddressFromDeployments() || ''
const NODE_URL = (import.meta.env.VITE_NODE_URL ?? DEFAULT_NODE_URL).trim() || DEFAULT_NODE_URL
const NETWORK = import.meta.env.VITE_ALEPHIUM_NETWORK?.trim() || 'testnet'
const EXPLORER_URL = NETWORK === 'mainnet' ? 'https://explorer.alephium.org' : 'https://testnet.alephium.org'
const fetcher: typeof fetch = (input, init) => window.fetch(input, init)

function formatAddress(address: string): string {
  const cleaned = stripAddressGroup(address)
  if (cleaned.length <= 12) return cleaned
  return `${cleaned.slice(0, 6)}...${cleaned.slice(-4)}`
}

function formatAddressWithYou(address: string, connectedAddress?: string): string {
  const cleaned = stripAddressGroup(address)
  const connectedCleaned = connectedAddress ? stripAddressGroup(connectedAddress) : ''
  const formatted = formatAddress(address)
  if (connectedCleaned && cleaned === connectedCleaned) {
    return `${formatted} (You)`
  }
  return formatted
}

function stripAddressGroup(address: string): string {
  // Alephium addresses may have a group suffix like ":0", ":1", etc. - remove it
  const colonIndex = address.indexOf(':')
  if (colonIndex !== -1) {
    return address.slice(0, colonIndex)
  }
  return address
}

function attoToAlph(atto: bigint, decimals: number = 4): string {
  const base = 10n ** 18n
  const integer = atto / base
  const fraction = (atto % base).toString().padStart(18, '0').slice(0, decimals)
  return `${integer.toString()}.${fraction}`
}

function alphToAtto(value: string): bigint | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const paddedFraction = (fraction + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole) * 10n ** 18n + BigInt(paddedFraction)
}

function sanitizeBetAmountInput(raw: string): string {
  const withDot = raw.replace(/,/g, '.')
  let result = ''
  let dotSeen = false
  for (const char of withDot) {
    if (char >= '0' && char <= '9') {
      result += char
    } else if (char === '.' && !dotSeen) {
      result += char
      dotSeen = true
    }
  }
  if (result.startsWith('.')) return `0${result}`
  return result
}

type TimerPart = { value: string; unit: string }
type UserBetHistoryItem = {
  roundId: bigint
  target: string
  amount: bigint
  finalized: boolean
  winner?: string
  claimed: boolean
  payout: bigint
}

type StoredActiveBetStatus = 'pending' | 'confirmed' | 'claimed'
type StoredActiveBet = {
  wallet: string
  roundId: string
  target: string
  amount: string
  status: StoredActiveBetStatus
  txId?: string
}
type ActiveBetView = {
  roundId: bigint
  target: string
  amount: bigint
  status: StoredActiveBetStatus
}
type AppPage = 'game' | 'betting' | 'instructions'

const THIRTY_MINUTES_MS = 30n * 60n * 1000n
const BET_STORAGE_PREFIX = 'halph.active-bet.'

function isValidAlephiumAddress(address: string): boolean {
  const normalized = stripAddressGroup(address.trim())
  if (normalized.length === 0) return false
  try {
    validateAddress(normalized)
    return true
  } catch {
    return false
  }
}

function getBetStorageKey(walletAddress: string): string {
  return `${BET_STORAGE_PREFIX}${stripAddressGroup(walletAddress)}`
}

function readStoredActiveBet(walletAddress: string): StoredActiveBet | null {
  try {
    const raw = window.localStorage.getItem(getBetStorageKey(walletAddress))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredActiveBet
    if (!parsed?.roundId || !parsed?.target || !parsed?.amount || !parsed?.status) return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredActiveBet(walletAddress: string, payload: StoredActiveBet): void {
  window.localStorage.setItem(getBetStorageKey(walletAddress), JSON.stringify(payload))
}

function clearStoredActiveBet(walletAddress: string): void {
  window.localStorage.removeItem(getBetStorageKey(walletAddress))
}

function getBasePath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function pageFromLocation(pathname: string, hash: string): AppPage {
  const normalizedHash = hash.replace(/^#/, '')
  if (normalizedHash === '/betting') return 'betting'
  if (normalizedHash === '/howto') return 'instructions'

  const base = getBasePath()
  const withoutBase = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  if (withoutBase === '/betting') return 'betting'
  if (withoutBase === '/howto') return 'instructions'
  return 'game'
}

function urlFromPage(page: AppPage): string {
  const base = getBasePath()
  if (page === 'betting') return `${base}#/betting`
  if (page === 'instructions') return `${base}#/howto`
  return `${base}#/`
}

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

function formatCompactTimer(parts: TimerPart[]): string {
  if (parts.length === 0) return '0s'
  const visible = parts.slice(0, 3)
  const compact = visible.map((part) => `${part.value}${part.unit}`).join(' ')
  return parts.length > 3 ? `${compact} ...` : compact
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
  const queryClient = useQueryClient()
  const [activePage, setActivePage] = useState<AppPage>(() => {
    if (typeof window === 'undefined') return 'game'
    return pageFromLocation(window.location.pathname, window.location.hash)
  })
  const [status, setStatus] = useState<string>('')
  const [betStatus, setBetStatus] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [playingDouble, setPlayingDouble] = useState(false)
  const [placingBet, setPlacingBet] = useState(false)
  const [finalizingBetRound, setFinalizingBetRound] = useState(false)
  const [claimingBet, setClaimingBet] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const [betTarget, setBetTarget] = useState('')
  const [betAmountInput, setBetAmountInput] = useState('1')
  const [debouncedQuoteInput, setDebouncedQuoteInput] = useState<{ target: string; amount: bigint | null }>({
    target: '',
    amount: null
  })
  const [localActiveBet, setLocalActiveBet] = useState<ActiveBetView | null>(null)
  const [nowMs, setNowMs] = useState<bigint>(BigInt(Date.now()))
  const wallet = useWallet()
  const { balance, updateBalanceForTx } = useBalance()
  const { connect } = useConnect()

  const walletAddress = wallet?.account?.address
  const cleanedWalletAddress = walletAddress ? stripAddressGroup(walletAddress) : undefined
  const availableAlph = BigInt(balance?.balance ?? '0')

  const navigateToPage = (nextPage: AppPage) => {
    setActivePage(nextPage)
    if (typeof window === 'undefined') return
    const nextUrl = urlFromPage(nextPage)
    const currentUrl = `${window.location.pathname}${window.location.hash || ''}`
    if (currentUrl !== nextUrl) {
      window.history.pushState({}, '', nextUrl)
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(BigInt(Date.now())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncPageFromLocation = () => {
      setActivePage(pageFromLocation(window.location.pathname, window.location.hash))
    }
    window.addEventListener('popstate', syncPageFromLocation)
    window.addEventListener('hashchange', syncPageFromLocation)
    return () => {
      window.removeEventListener('popstate', syncPageFromLocation)
      window.removeEventListener('hashchange', syncPageFromLocation)
    }
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
    enabled: CONTRACT_ADDRESS.length > 0,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: roundSnapshot } = useQuery<[boolean, bigint, bigint, string]>({
    queryKey: ['round-snapshot', NODE_URL, CONTRACT_ADDRESS],
    queryFn: async () => {
      if (CONTRACT_ADDRESS.length === 0) {
        throw new Error('Missing contract address')
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const game = CountdownGame.at(CONTRACT_ADDRESS)
      const result = await game.view.getRoundSnapshot()
      return result.returns
    },
    enabled: CONTRACT_ADDRESS.length > 0,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const baseCurrentPlayCost = state?.currentPlayCost ?? 5n * 10n ** 18n
  // If round is expired, price will increase by 1% when settled
  const currentTimestamp = BigInt(Date.now())
  const willSettleOnPlay = state?.roundActive && currentTimestamp >= (state?.deadlineMs ?? 0n)
  const currentPlayCost = willSettleOnPlay ? baseCurrentPlayCost * 101n / 100n : baseCurrentPlayCost
  const doublePlayCost = currentPlayCost * 2n
  const canPlay = wallet !== undefined && CONTRACT_ADDRESS.length > 0
  const hasEnoughForSingle = availableAlph >= currentPlayCost
  const hasEnoughForDouble = availableAlph >= doublePlayCost
  const isRoundActive = roundSnapshot?.[0] ?? state?.roundActive ?? false
  const currentRoundId = roundSnapshot?.[1] ?? state?.currentRoundId ?? 0n
  const currentLeader = roundSnapshot?.[3] ?? state?.currentLeader ?? ''
  const roundDeadlineMs = roundSnapshot?.[2] ?? state?.deadlineMs ?? 0n
  const lastSettledRoundId = state?.lastSettledRoundId ?? 0n
  const minBet = CountdownBettingMarket.consts.MIN_BET
  const betAmount = alphToAtto(betAmountInput)
  const isBetAmountPositive = betAmount !== null && betAmount > 0n
  const cleanedBetTarget = stripAddressGroup(betTarget.trim())
  const isBetTargetValidAddress = cleanedBetTarget.length > 0 && isValidAlephiumAddress(cleanedBetTarget)
  const isBetAmountValid = betAmount !== null && betAmount >= minBet && betAmount > 0n
  const timeLeftForBetting = isRoundActive && roundDeadlineMs > nowMs ? roundDeadlineMs - nowMs : 0n
  const bettingWindowOpen = timeLeftForBetting >= THIRTY_MINUTES_MS
  const canPlaceBet =
    wallet !== undefined &&
    BETTING_CONTRACT_ADDRESS.length > 0 &&
    isRoundActive &&
    bettingWindowOpen &&
    isBetTargetValidAddress &&
    isBetAmountPositive &&
    isBetAmountValid &&
    betAmount !== null &&
    availableAlph >= betAmount

  const { data: myBet } = useQuery({
    queryKey: ['my-bet', NODE_URL, BETTING_CONTRACT_ADDRESS, currentRoundId.toString(), cleanedWalletAddress],
    queryFn: async () => {
      if (!cleanedWalletAddress || BETTING_CONTRACT_ADDRESS.length === 0) return null
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.getUserBet({
        args: {
          roundId: currentRoundId,
          bettor: cleanedWalletAddress
        }
      })
      return result.returns
    },
    enabled: Boolean(cleanedWalletAddress) && BETTING_CONTRACT_ADDRESS.length > 0 && currentRoundId > 0n,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: myLastSettledBet } = useQuery({
    queryKey: ['my-last-settled-bet', NODE_URL, BETTING_CONTRACT_ADDRESS, lastSettledRoundId.toString(), cleanedWalletAddress],
    queryFn: async () => {
      if (!cleanedWalletAddress || BETTING_CONTRACT_ADDRESS.length === 0 || lastSettledRoundId === 0n) return null
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.getUserBet({
        args: {
          roundId: lastSettledRoundId,
          bettor: cleanedWalletAddress
        }
      })
      return result.returns
    },
    enabled: Boolean(cleanedWalletAddress) && BETTING_CONTRACT_ADDRESS.length > 0 && lastSettledRoundId > 0n,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: payoutQuote = 0n } = useQuery({
    queryKey: [
      'bet-quote',
      NODE_URL,
      BETTING_CONTRACT_ADDRESS,
      currentRoundId.toString(),
      debouncedQuoteInput.target,
      debouncedQuoteInput.amount?.toString() ?? '0'
    ],
    queryFn: async () => {
      if (BETTING_CONTRACT_ADDRESS.length === 0) return 0n
      if (debouncedQuoteInput.amount === null || debouncedQuoteInput.amount <= 0n) return 0n
      if (debouncedQuoteInput.target.length === 0) return 0n
      if (!isValidAlephiumAddress(debouncedQuoteInput.target)) return 0n
      if (currentRoundId === 0n) {
        return 0n
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.quotePayout({
        args: {
          roundId: currentRoundId,
          target: debouncedQuoteInput.target,
          amount: debouncedQuoteInput.amount
        }
      })
      return result.returns
    },
    enabled:
      BETTING_CONTRACT_ADDRESS.length > 0 &&
      currentRoundId > 0n &&
      debouncedQuoteInput.amount !== null &&
      debouncedQuoteInput.amount > 0n,
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  })

  const { data: playedPlayers = [] } = useQuery<string[]>({
    queryKey: ['played-players', NODE_URL, CONTRACT_ADDRESS, currentRoundId.toString()],
    queryFn: async () => {
      if (CONTRACT_ADDRESS.length === 0) return []
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const provider = web3.getCurrentNodeProvider()
      let start = 0
      const players: string[] = []
      for (let i = 0; i < 100; i += 1) {
        const page = await provider.events.getEventsContractContractaddress(CONTRACT_ADDRESS, { start })
        for (const event of page.events) {
          if (event.eventIndex !== CountdownGame.eventIndex.Played) continue
          const roundField = event.fields[0]
          const playerField = event.fields[1]
          if (typeof roundField?.value === 'string' && typeof playerField?.value === 'string') {
            if (BigInt(roundField.value) === currentRoundId) {
              // Strip any group suffix from the address
              players.push(stripAddressGroup(playerField.value))
            }
          }
        }
        if (page.nextStart === start) break
        start = page.nextStart
      }
      const uniqueLatestFirst = [...new Set(players.reverse())]
      return uniqueLatestFirst
    },
    enabled: CONTRACT_ADDRESS.length > 0,
    refetchInterval: 8000,
    refetchIntervalInBackground: true
  })

  const { data: myBetHistory = [] } = useQuery<UserBetHistoryItem[]>({
    queryKey: ['my-bet-history', NODE_URL, BETTING_CONTRACT_ADDRESS, walletAddress],
    queryFn: async () => {
      if (!walletAddress || BETTING_CONTRACT_ADDRESS.length === 0) return []
      const cleanedWalletAddress = stripAddressGroup(walletAddress)
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const provider = web3.getCurrentNodeProvider()
      let start = 0
      const byRound = new Map<string, UserBetHistoryItem>()
      const finalizedByRound = new Map<string, { winner?: string }>()
      for (let i = 0; i < 200; i += 1) {
        const page = await provider.events.getEventsContractContractaddress(BETTING_CONTRACT_ADDRESS, { start })
        for (const event of page.events) {
          if (event.eventIndex === CountdownBettingMarket.eventIndex.BetPlaced) {
            const roundId = event.fields[0]?.value
            const bettor = event.fields[1]?.value
            const target = event.fields[2]?.value
            const amount = event.fields[3]?.value
            if (typeof roundId !== 'string' || typeof bettor !== 'string' || typeof target !== 'string' || typeof amount !== 'string') continue
            if (stripAddressGroup(bettor) !== cleanedWalletAddress) continue
            byRound.set(roundId, {
              roundId: BigInt(roundId),
              target: stripAddressGroup(target),
              amount: BigInt(amount),
              finalized: byRound.get(roundId)?.finalized ?? false,
              winner: byRound.get(roundId)?.winner,
              claimed: false,
              payout: 0n
            })
          } else if (event.eventIndex === CountdownBettingMarket.eventIndex.RoundFinalized) {
            const roundId = event.fields[0]?.value
            const winner = event.fields[1]?.value
            if (typeof roundId !== 'string' || typeof winner !== 'string') continue
            finalizedByRound.set(roundId, { winner: stripAddressGroup(winner) })
            const existing = byRound.get(roundId)
            if (existing) {
              existing.finalized = true
              existing.winner = stripAddressGroup(winner)
              byRound.set(roundId, existing)
            }
          } else if (event.eventIndex === CountdownBettingMarket.eventIndex.Claimed) {
            const roundId = event.fields[0]?.value
            const bettor = event.fields[1]?.value
            const payout = event.fields[3]?.value
            if (typeof roundId !== 'string' || typeof bettor !== 'string' || typeof payout !== 'string') continue
            if (stripAddressGroup(bettor) !== cleanedWalletAddress) continue
            const existing = byRound.get(roundId)
            if (existing) {
              existing.claimed = true
              existing.payout = BigInt(payout)
              byRound.set(roundId, existing)
            }
          }
        }
        if (page.nextStart === start) break
        start = page.nextStart
      }

      const items = [...byRound.values()]
        .map((item) => {
          const finalized = finalizedByRound.get(item.roundId.toString())
          return {
            ...item,
            finalized: item.finalized || finalized !== undefined,
            winner: item.winner ?? finalized?.winner
          }
        })
        .filter((item) => item.amount > 0n || item.claimed)
        .sort((a, b) => Number(b.roundId - a.roundId))

      return items.slice(0, 10)
    },
    enabled: Boolean(walletAddress) && BETTING_CONTRACT_ADDRESS.length > 0,
    refetchInterval: 8000,
    refetchIntervalInBackground: true
  })

  // Query for betting stats: total pool, per-player breakdown
  // Scans BetPlaced events to find all unique targets for the current round
  const { data: bettingStats } = useQuery({
    queryKey: ['betting-stats', NODE_URL, BETTING_CONTRACT_ADDRESS, currentRoundId.toString()],
    queryFn: async () => {
      if (BETTING_CONTRACT_ADDRESS.length === 0 || currentRoundId === 0n) {
        return { totalPool: 0n, byPlayer: new Map<string, bigint>() }
      }
      
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const provider = web3.getCurrentNodeProvider()
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      
      // First, scan BetPlaced events to find all unique targets for this round
      const targetsInRound = new Set<string>()
      let start = 0
      for (let i = 0; i < 200; i += 1) {
        const page = await provider.events.getEventsContractContractaddress(BETTING_CONTRACT_ADDRESS, { start })
        for (const event of page.events) {
          if (event.eventIndex === CountdownBettingMarket.eventIndex.BetPlaced) {
            const roundId = event.fields[0]?.value
            const target = event.fields[2]?.value
            if (typeof roundId !== 'string' || typeof target !== 'string') continue
            if (BigInt(roundId) !== currentRoundId) continue
            targetsInRound.add(stripAddressGroup(target))
          }
        }
        if (page.nextStart === start) break
        start = page.nextStart
      }
      
      if (targetsInRound.size === 0) {
        return { totalPool: 0n, byPlayer: new Map<string, bigint>() }
      }
      
      // Now query the contract for accurate pool amounts for each target
      let totalPool = 0n
      const byPlayer = new Map<string, bigint>()
      
      for (const target of targetsInRound) {
        const pools = await market.view.getRoundPools({ args: { roundId: currentRoundId, target } })
        // First call gets us the total pool
        if (totalPool === 0n) {
          totalPool = pools.returns[0]
        }
        const targetPool = pools.returns[1]
        if (targetPool > 0n) {
          byPlayer.set(target, targetPool)
        }
      }
      
      return { totalPool, byPlayer }
    },
    enabled: BETTING_CONTRACT_ADDRESS.length > 0 && currentRoundId > 0n,
    refetchInterval: 8000,
    refetchIntervalInBackground: true
  })

  const totalBettingPool = bettingStats?.totalPool ?? 0n
  const bettingByPlayer = useMemo(
    () => bettingStats?.byPlayer ?? new Map<string, bigint>(),
    [bettingStats]
  )
  
  // Find the player with most bets
  const topBetPlayer = useMemo(() => {
    if (bettingByPlayer.size === 0) return null
    let maxPlayer = ''
    let maxAmount = 0n
    for (const [player, amount] of bettingByPlayer.entries()) {
      if (amount > maxAmount) {
        maxAmount = amount
        maxPlayer = player
      }
    }
    return maxPlayer ? { address: maxPlayer, amount: maxAmount } : null
  }, [bettingByPlayer])

  const { data: finalizedRoundIds = new Set<string>() } = useQuery({
    queryKey: ['finalized-round-ids', NODE_URL, BETTING_CONTRACT_ADDRESS],
    queryFn: async () => {
      if (BETTING_CONTRACT_ADDRESS.length === 0) return new Set<string>()
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const provider = web3.getCurrentNodeProvider()
      let start = 0
      const ids = new Set<string>()
      for (let i = 0; i < 200; i += 1) {
        const page = await provider.events.getEventsContractContractaddress(BETTING_CONTRACT_ADDRESS, { start })
        for (const event of page.events) {
          if (event.eventIndex !== CountdownBettingMarket.eventIndex.RoundFinalized) continue
          const roundId = event.fields[0]?.value
          if (typeof roundId === 'string') ids.add(roundId)
        }
        if (page.nextStart === start) break
        start = page.nextStart
      }
      return ids
    },
    enabled: BETTING_CONTRACT_ADDRESS.length > 0,
    refetchInterval: 8000,
    refetchIntervalInBackground: true
  })

  const play = async (isDouble: boolean = false) => {
    if (wallet === undefined) {
      setStatus('Connect your Alephium wallet to enter the arena.')
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

      // Fetch latest state to get accurate play cost
      const latestState = await game.fetchState()
      let latestPlayCost = latestState.fields.currentPlayCost
      
      // If round is expired, the contract will settle it first which increases price by 1%
      const now = BigInt(Date.now())
      const roundExpired = latestState.fields.roundActive && now >= latestState.fields.deadlineMs
      if (roundExpired) {
        latestPlayCost = latestPlayCost * 101n / 100n
      }
      
      const cost = isDouble ? latestPlayCost * 2n : latestPlayCost
      
      if (availableAlph < cost) {
        setStatus(`Insufficient ALPH. ${roundExpired ? 'After settlement, price' : 'Current price'} is ${attoToAlph(cost, 4)} ALPH but you have ${attoToAlph(availableAlph, 4)} ALPH.`)
        setPlaying(false)
        setPlayingDouble(false)
        return
      }

      const result = isDouble
        ? await game.transact.playDouble({
            signer,
            attoAlphAmount: cost
          })
        : await game.transact.play({
            signer,
            attoAlphAmount: cost
          })
      
      updateBalanceForTx(result.txId)
      setPendingTxId(result.txId)
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
      setPendingTxId(null)
    }
  }

  const placeBet = async () => {
    if (wallet === undefined) {
      setBetStatus('Connect your wallet to place a prediction.')
      return
    }
    if (BETTING_CONTRACT_ADDRESS.length === 0) {
      setBetStatus('Missing prediction contract address.')
      return
    }
    if (!isRoundActive) {
      setBetStatus('Predicting is open only during an active round.')
      return
    }
    if (!bettingWindowOpen) {
      setBetStatus('Predictions close 30 minutes before round end.')
      return
    }
    const target = cleanedBetTarget
    if (target.length === 0) {
      setBetStatus('Enter the target address you want to back.')
      return
    }
    if (!isBetTargetValidAddress) {
      setBetStatus('Enter a valid Alephium address.')
      return
    }
    if (betAmount === null || betAmount <= 0n) {
      setBetStatus('Bet amount must be greater than 0.')
      return
    }
    if (!isBetAmountValid) {
      setBetStatus(`Minimum prediction is ${attoToAlph(minBet, 2)} ALPH.`)
      return
    }
    if (availableAlph < betAmount) {
      setBetStatus('Insufficient ALPH balance for this prediction.')
      return
    }

    setPlacingBet(true)
    setConfirming(true)
    setBetStatus('')
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')
      if (!cleanedWalletAddress) throw new Error('Missing connected wallet address.')

      setLocalActiveBet({
        roundId: currentRoundId,
        target,
        amount: betAmount,
        status: 'pending'
      })
      const result = await market.transact.placeBet({
        signer,
        args: {
          roundId: currentRoundId,
          target,
          amount: betAmount
        },
        attoAlphAmount: betAmount + 5n * 10n ** 17n
      })
      updateBalanceForTx(result.txId)
      setPendingTxId(result.txId)
      writeStoredActiveBet(cleanedWalletAddress, {
        wallet: cleanedWalletAddress,
        roundId: currentRoundId.toString(),
        target,
        amount: betAmount.toString(),
        status: 'pending',
        txId: result.txId
      })
      setBetStatus('Prediction submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      setLocalActiveBet({
        roundId: currentRoundId,
        target,
        amount: betAmount,
        status: 'confirmed'
      })
      writeStoredActiveBet(cleanedWalletAddress, {
        wallet: cleanedWalletAddress,
        roundId: currentRoundId.toString(),
        target,
        amount: betAmount.toString(),
        status: 'confirmed',
        txId: result.txId
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-bet'] }),
        queryClient.invalidateQueries({ queryKey: ['my-bet-history'] }),
        queryClient.invalidateQueries({ queryKey: ['betting-stats'] })
      ])
      setBetStatus('Prediction confirmed on-chain.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (cleanedWalletAddress) {
        clearStoredActiveBet(cleanedWalletAddress)
      }
      setLocalActiveBet(null)
      setBetStatus(`Prediction failed: ${message}`)
    } finally {
      setPlacingBet(false)
      setConfirming(false)
      setPendingTxId(null)
    }
  }

  const finalizeBettingRound = async (roundId?: bigint) => {
    if (wallet === undefined || BETTING_CONTRACT_ADDRESS.length === 0 || CONTRACT_ADDRESS.length === 0) return
    const targetRoundId = roundId ?? lastSettledRoundId
    
    setFinalizingBetRound(true)
    setConfirming(true)
    setBetStatus('')
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const game = CountdownGame.at(CONTRACT_ADDRESS)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')
      
      // First, check if we need to settle the game round
      const gameState = await game.fetchState()
      const now = BigInt(Date.now())
      const roundExpired = gameState.fields.roundActive && now >= gameState.fields.deadlineMs
      
      if (roundExpired) {
        // Settle the expired game round first
        setBetStatus('Settling expired round...')
        const settleResult = await game.transact.settleRound({ signer })
        updateBalanceForTx(settleResult.txId)
        setPendingTxId(settleResult.txId)
        await waitForTxConfirmation(settleResult.txId, 1, 1000)
        setBetStatus('Round settled. Finalizing predictions...')
      }
      
      // Refresh state to get updated lastSettledRoundId
      const updatedState = await game.fetchState()
      const finalizeRoundId = targetRoundId !== 0n ? targetRoundId : updatedState.fields.lastSettledRoundId
      
      if (finalizeRoundId === 0n) {
        setBetStatus('No settled round yet to finalize.')
        return
      }
      
      // Now finalize the betting round
      const result = await market.transact.finalizeRound({
        signer,
        args: { roundId: finalizeRoundId },
        attoAlphAmount: 3n * 10n ** 17n
      })
      updateBalanceForTx(result.txId)
      setPendingTxId(result.txId)
      setBetStatus('Finalize submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-bet-history'] }),
        queryClient.invalidateQueries({ queryKey: ['countdown-state'] }),
        queryClient.invalidateQueries({ queryKey: ['round-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['finalized-round-ids'] })
      ])
      setBetStatus(`Round #${finalizeRoundId.toString()} finalized for predictions.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBetStatus(`Finalize failed: ${message}`)
    } finally {
      setFinalizingBetRound(false)
      setConfirming(false)
      setPendingTxId(null)
    }
  }

  const claimBet = async (roundId?: bigint) => {
    if (wallet === undefined || BETTING_CONTRACT_ADDRESS.length === 0) return
    const targetRoundId = roundId ?? lastSettledRoundId
    if (targetRoundId === 0n) {
      setBetStatus('No settled round yet to claim.')
      return
    }
    setClaimingBet(true)
    setConfirming(true)
    setBetStatus('')
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')
      const result = await market.transact.claim({
        signer,
        args: { roundId: targetRoundId }
      })
      updateBalanceForTx(result.txId)
      setPendingTxId(result.txId)
      setBetStatus('Claim submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      if (cleanedWalletAddress && localActiveBet && localActiveBet.roundId === targetRoundId) {
        writeStoredActiveBet(cleanedWalletAddress, {
          wallet: cleanedWalletAddress,
          roundId: localActiveBet.roundId.toString(),
          target: localActiveBet.target,
          amount: localActiveBet.amount.toString(),
          status: 'claimed',
          txId: result.txId
        })
        setLocalActiveBet({ ...localActiveBet, status: 'claimed' })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-bet-history'] }),
        queryClient.invalidateQueries({ queryKey: ['my-last-settled-bet'] })
      ])
      setBetStatus(`Claim settled for round #${targetRoundId.toString()}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBetStatus(`Claim failed: ${message}`)
    } finally {
      setClaimingBet(false)
      setConfirming(false)
      setPendingTxId(null)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuoteInput({ target: cleanedBetTarget, amount: betAmount })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [cleanedBetTarget, betAmount])

  useEffect(() => {
    if (!cleanedWalletAddress) {
      setLocalActiveBet(null)
      return
    }
    const stored = readStoredActiveBet(cleanedWalletAddress)
    if (!stored) {
      setLocalActiveBet(null)
      return
    }
    const parsedRoundId = BigInt(stored.roundId)
    if (parsedRoundId !== currentRoundId && stored.status !== 'claimed') {
      clearStoredActiveBet(cleanedWalletAddress)
      setLocalActiveBet(null)
      return
    }
    setLocalActiveBet({
      roundId: parsedRoundId,
      target: stored.target,
      amount: BigInt(stored.amount),
      status: stored.status
    })
  }, [cleanedWalletAddress, currentRoundId])

  const timeLeftMs = useMemo(() => {
    if (!isRoundActive) return 0n
    if (roundDeadlineMs <= nowMs) return 0n
    return roundDeadlineMs - nowMs
  }, [isRoundActive, roundDeadlineMs, nowMs])

  const timerParts = useMemo(() => msToTimerParts(timeLeftMs), [timeLeftMs])
  const pot = state?.currentPot ?? 0n
  const prizePot = (pot * 80n) / 100n
  const savingsPot = state?.savingsPot ?? 0n
  const totalSavings = savingsPot + (pot * 20n) / 100n
  const halvedCount = state ? getHalvedCount(state.currentDurationMs) : 0
  const isExpired = Boolean(isRoundActive && timeLeftMs === 0n)
  const isBettingWindowClosed = timeLeftMs < THIRTY_MINUTES_MS
  const hasMyBet = Boolean(myBet?.[0])
  const myBetTarget = hasMyBet ? stripAddressGroup(myBet?.[1] ?? '') : undefined
  const myBetAmount = hasMyBet ? myBet?.[2] ?? 0n : 0n
  const hasMyLastSettledBet = Boolean(myLastSettledBet?.[0])
  const myLastSettledBetTarget = hasMyLastSettledBet ? stripAddressGroup(myLastSettledBet?.[1] ?? '') : undefined
  const myLastSettledBetAmount = hasMyLastSettledBet ? myLastSettledBet?.[2] ?? 0n : 0n
  const hasMyConfirmedRoundBet = hasMyBet && myBetAmount > 0n
  const activeBet: ActiveBetView | null = hasMyConfirmedRoundBet && myBetTarget
    ? { roundId: currentRoundId, target: myBetTarget, amount: myBetAmount, status: 'confirmed' }
    : localActiveBet && localActiveBet.roundId === currentRoundId && localActiveBet.status !== 'claimed'
      ? localActiveBet
      : null
  const shouldShowActiveBetPanel = activeBet !== null
  const isBusy = playing || playingDouble || placingBet || finalizingBetRound || claimingBet || confirming
  const selectablePlayers = useMemo(() => {
    if (!currentLeader) return playedPlayers
    const leader = stripAddressGroup(currentLeader)
    return playedPlayers.includes(leader) ? playedPlayers : [leader, ...playedPlayers]
  }, [playedPlayers, currentLeader])

  const isTargetInRecentPlayers = cleanedBetTarget.length > 0 && selectablePlayers.includes(cleanedBetTarget)
  const selectedPlayerPool = cleanedBetTarget.length > 0 ? bettingByPlayer.get(cleanedBetTarget) ?? 0n : 0n
  const lastSettledHistory = myBetHistory.find((item) => item.roundId === lastSettledRoundId)
  const lastSettledWinner = state?.lastSettledWinner ? stripAddressGroup(state.lastSettledWinner) : undefined
  const isLastSettledRoundFinalized = finalizedRoundIds.has(lastSettledRoundId.toString())
  const didWinLastSettledRound =
    Boolean(lastSettledWinner) &&
    Boolean(myLastSettledBetTarget) &&
    stripAddressGroup(myLastSettledBetTarget ?? '') === stripAddressGroup(lastSettledWinner ?? '')
  const hasClaimedLastSettledRound = Boolean(lastSettledHistory?.claimed)
  const showFinalizeRoundCta = walletAddress && !isBusy && ((isRoundActive && isExpired) || (lastSettledRoundId > 0n && !isLastSettledRoundFinalized))
  const finalizeCtaRoundId = isRoundActive && isExpired ? currentRoundId : lastSettledRoundId

  const { data: claimablePayout = 0n } = useQuery({
    queryKey: [
      'claimable-payout',
      NODE_URL,
      BETTING_CONTRACT_ADDRESS,
      lastSettledRoundId.toString(),
      myLastSettledBetTarget ?? '',
      myLastSettledBetAmount.toString(),
      didWinLastSettledRound ? 'win' : 'lose'
    ],
    queryFn: async () => {
      if (
        BETTING_CONTRACT_ADDRESS.length === 0 ||
        lastSettledRoundId === 0n ||
        !myLastSettledBetTarget ||
        myLastSettledBetAmount <= 0n ||
        !didWinLastSettledRound
      ) {
        return 0n
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.quotePayout({
        args: {
          roundId: lastSettledRoundId,
          target: myLastSettledBetTarget,
          amount: myLastSettledBetAmount
        }
      })
      return result.returns
    },
    enabled:
      BETTING_CONTRACT_ADDRESS.length > 0 &&
      lastSettledRoundId > 0n &&
      Boolean(myLastSettledBetTarget) &&
      myLastSettledBetAmount > 0n &&
      didWinLastSettledRound &&
      isLastSettledRoundFinalized,
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  })

  const { data: activeBetQuote = 0n } = useQuery({
    queryKey: [
      'active-bet-quote',
      NODE_URL,
      BETTING_CONTRACT_ADDRESS,
      activeBet?.roundId.toString() ?? '0',
      activeBet?.target ?? '',
      activeBet?.amount.toString() ?? '0'
    ],
    queryFn: async () => {
      if (!activeBet || BETTING_CONTRACT_ADDRESS.length === 0) return 0n
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.quotePayout({
        args: {
          roundId: activeBet.roundId,
          target: activeBet.target,
          amount: activeBet.amount
        }
      })
      return result.returns
    },
    enabled: Boolean(activeBet) && BETTING_CONTRACT_ADDRESS.length > 0,
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  })

  useEffect(() => {
    if (betTarget.length > 0) return
    if (selectablePlayers.length === 0) return
    setBetTarget(selectablePlayers[0])
  }, [betTarget, selectablePlayers])

  useEffect(() => {
    if (!cleanedWalletAddress) return
    if (!hasMyConfirmedRoundBet || !myBetTarget) return
    const synced = {
      wallet: cleanedWalletAddress,
      roundId: currentRoundId.toString(),
      target: myBetTarget,
      amount: myBetAmount.toString(),
      status: 'confirmed' as const
    }
    writeStoredActiveBet(cleanedWalletAddress, synced)
    setLocalActiveBet({
      roundId: currentRoundId,
      target: myBetTarget,
      amount: myBetAmount,
      status: 'confirmed'
    })
  }, [cleanedWalletAddress, hasMyConfirmedRoundBet, myBetTarget, currentRoundId, myBetAmount])

  return (
    <div className="marble-bg min-h-screen">
      {/* Header */}
      <header className="absolute top-4 right-4 z-10">
        <AlephiumConnectButton />
      </header>

      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col items-center px-4 py-8 sm:px-6 xl:px-10">
        
        {/* Laurel & Title */}
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="font-roman text-4xl font-semibold tracking-wide text-[#1C1C1C] sm:text-5xl md:text-6xl">
            The <span className="lowercase">h</span>ALPHing
          </h1>
          <p className="mt-2 text-base font-light italic tracking-wide text-[#1C1C1C]/60 sm:text-lg">
            Timer-halving survival game
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigateToPage('game')}
              className={`rounded border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${activePage === 'game' ? 'border-[#8B7355] bg-[#8B7355]/15 text-[#1C1C1C]' : 'border-[#1C1C1C]/25 bg-white/50 text-[#1C1C1C]/70'}`}
            >
              Game
            </button>
            <button
              onClick={() => navigateToPage('betting')}
              className={`rounded border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${activePage === 'betting' ? 'border-[#8B7355] bg-[#8B7355]/15 text-[#1C1C1C]' : 'border-[#1C1C1C]/25 bg-white/50 text-[#1C1C1C]/70'}`}
            >
              Predicting
            </button>
            <button
              onClick={() => navigateToPage('instructions')}
              className={`rounded border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${activePage === 'instructions' ? 'border-[#8B7355] bg-[#8B7355]/15 text-[#1C1C1C]' : 'border-[#1C1C1C]/25 bg-white/50 text-[#1C1C1C]/70'}`}
            >
              How to Play
            </button>
          </div>
        </div>

        {activePage === 'game' && (
          <>
            {/* Main Game Section with Columns */}
            <div className="flex w-full items-stretch justify-center">
              <RomanColumn side="left" />
              
              {/* Dark Marble Frame */}
              <div className="dark-marble-frame relative w-full max-w-[52rem] overflow-hidden rounded-sm border-4 border-[#8B7355] shadow-2xl xl:max-w-[64rem]">
                {/* Inner cream/white content area */}
                <div className="relative bg-[#F5F0E8] px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
              
              {/* Current Emperor */}
              <div className="mb-6 flex flex-col items-center">
                <div className="mb-1 flex items-center gap-2 text-base font-semibold italic text-[#1C1C1C]/75 sm:text-lg">
                  <span>Current Emperor</span>
                  <Crown size={20} strokeWidth={1.75} className="text-[#C9A227]" />
                </div>
                <p className="font-mono text-base text-[#1C1C1C]/85 sm:text-lg">
                  {isLoading ? '...' : currentLeader ? formatAddressWithYou(currentLeader, walletAddress) : '—'}
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
                  <div className="mx-auto max-w-full font-roman text-4xl font-bold tracking-wide text-[#1C1C1C] sm:text-5xl md:text-6xl">
                    <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-1 leading-none">
                      {timerParts.map((part) => (
                        <span key={part.unit} className="inline-flex items-end">
                          <span className="tabular-nums">{part.value}</span>
                          <span className="ml-0.5 text-2xl font-normal text-[#1C1C1C]/50 sm:text-3xl">{part.unit}</span>
                        </span>
                      ))}
                    </div>
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
                  <p className="mt-0.5 text-[10px] italic text-[#1C1C1C]/40">Total prize pool</p>
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
                  <p>
                    <span className="font-semibold">Time's Up!</span> {currentLeader ? formatAddressWithYou(currentLeader, walletAddress) : '—'} wins {attoToAlph(prizePot, 2)} ALPH.
                  </p>
                  <p className="mt-1 text-[10px] italic text-[#1C1C1C]/50">
                    Click below to pay the winner and start a new round
                  </p>
                </div>
              )}

              {/* Play Buttons */}
              <div className="space-y-3">
                {/* Single Play Button - shows Connect Wallet when not connected */}
                <button
                  onClick={() => walletAddress ? play(false) : connect()}
                  disabled={walletAddress ? (!canPlay || isBusy || !hasEnoughForSingle) : false}
                  className="mx-auto block w-full max-w-xs rounded-sm border-2 border-[#8B7355] bg-transparent px-8 py-3 font-roman text-sm font-semibold uppercase tracking-[0.2em] text-[#1C1C1C] transition-all duration-200 hover:bg-[#8B7355]/10 focus:outline-none focus:ring-2 focus:ring-[#8B7355]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  {!walletAddress
                    ? 'Connect Wallet to Play'
                    : !hasEnoughForSingle
                      ? 'Insufficient Tribute'
                      : playing
                        ? 'Submitting...'
                        : confirming && !playingDouble
                          ? 'Confirming...'
                          : isExpired
                            ? `Claim & Start New Round — ${attoToAlph(currentPlayCost, 2)}`
                            : `Enter the Arena — ${attoToAlph(currentPlayCost, 2)}`}
                </button>

                {/* Double Play Button - shows Connect Wallet when not connected */}
                <button
                  onClick={() => walletAddress ? play(true) : connect()}
                  disabled={walletAddress ? (!canPlay || isBusy || !hasEnoughForDouble || !isRoundActive || isExpired) : false}
                  className="mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-sm border-2 border-[#C9A227] bg-[#C9A227]/10 px-8 py-3 font-roman text-sm font-semibold uppercase tracking-[0.2em] text-[#1C1C1C] transition-all duration-200 hover:bg-[#C9A227]/20 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                >
                  <Zap size={16} className="text-[#C9A227]" />
                  {!walletAddress
                    ? 'Connect Wallet'
                    : !isRoundActive
                      ? 'Start Round First'
                      : isExpired
                        ? 'Round Expired'
                        : !hasEnoughForDouble
                          ? 'Need More ALPH'
                          : playingDouble
                            ? 'Submitting...'
                            : confirming && playingDouble
                              ? 'Confirming...'
                              : `Double Down — ${attoToAlph(doublePlayCost, 2)}`}
                </button>
                
                <p className="text-center text-[10px] italic text-[#1C1C1C]/50">
                  Double down halves the timer twice (÷4)
                </p>
              </div>
              
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
            <div className="mt-8 w-full max-w-[52rem] xl:max-w-[64rem]">
              <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-[#C9A227]/60 to-transparent" />
              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">Prize Pot (80%)</p>
                  <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">{attoToAlph(prizePot, 2)}</p>
                  <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
                </div>
                <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">Next Round Seed (20%)</p>
                  <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">{attoToAlph(totalSavings, 2)}</p>
                  <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
                  <p className="mt-0.5 text-[9px] italic text-[#1C1C1C]/40">Added to next round's pot</p>
                </div>
              </div>
            </div>
          </>
        )}

        {activePage === 'betting' && (
          <div className="w-full max-w-4xl rounded-sm border-4 border-[#8B7355] bg-[#F5F0E8] px-6 py-8 shadow-2xl sm:px-10 lg:max-w-5xl lg:px-12 xl:max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#1C1C1C]/70">On-chain Winner Prediction</p>
            <div className="mt-3 rounded border border-[#1C1C1C]/15 bg-white/70 p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#1C1C1C]/55">Round</p>
                  <p className="font-roman text-lg text-[#1C1C1C]">#{currentRoundId.toString()}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#1C1C1C]/55">Game Pool</p>
                  <p className="font-roman text-lg text-[#1C1C1C]">{attoToAlph(pot, 2)} ALPH</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#1C1C1C]/55">Countdown</p>
                  <p className="font-mono text-sm leading-tight text-[#1C1C1C] sm:text-base">
                    {timeLeftMs === 0n ? '0s' : formatCompactTimer(timerParts)}
                  </p>
                </div>
              </div>
              {currentLeader && (
                <div className="mt-3 rounded border border-[#8B7355]/30 bg-[#8B7355]/10 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#1C1C1C]/55">Current Leader</p>
                  <p className="mt-1 break-all font-mono text-base font-semibold text-[#1C1C1C] sm:text-lg">
                    {formatAddressWithYou(currentLeader, walletAddress)}
                  </p>
                </div>
              )}
            </div>

            {/* Prediction Stats */}
            <div className="mt-4 grid grid-cols-2 gap-4 rounded border border-[#C9A227]/30 bg-[#C9A227]/5 p-4">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C]/60">Total Prediction Pool</p>
                <p className="font-roman text-xl font-bold text-[#C9A227]">{attoToAlph(totalBettingPool, 2)} <span className="text-sm font-normal">ALPH</span></p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C]/60">Favorite</p>
                {topBetPlayer ? (
                  <>
                    <p className="font-mono text-xs text-[#1C1C1C]/80">{formatAddressWithYou(topBetPlayer.address, walletAddress)}</p>
                    <p className="text-[10px] text-[#C9A227]">{attoToAlph(topBetPlayer.amount, 2)} ALPH ({totalBettingPool > 0n ? Math.round(Number(topBetPlayer.amount * 100n / totalBettingPool)) : 0}%)</p>
                  </>
                ) : (
                  <p className="text-xs text-[#1C1C1C]/50">No predictions yet</p>
                )}
              </div>
            </div>
            {/* Per-player prediction breakdown with odds */}
            {bettingByPlayer.size > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C]/50">Prediction Odds</p>
                <div className="rounded border border-[#1C1C1C]/10 bg-white/50 overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 bg-[#1C1C1C]/5 text-[9px] font-semibold uppercase tracking-wider text-[#1C1C1C]/50">
                    <span>Player</span>
                    <span className="text-right">Pool</span>
                    <span className="text-right">Share</span>
                    <span className="text-right">Odds</span>
                  </div>
                  {[...bettingByPlayer.entries()]
                    .sort((a, b) => Number(b[1] - a[1]))
                    .map(([player, amount]) => {
                      const percentage = totalBettingPool > 0n ? Number(amount * 100n / totalBettingPool) : 0
                      const odds = amount > 0n ? Number(totalBettingPool * 100n / amount) / 100 : 0
                      return (
                        <div key={player} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-t border-[#1C1C1C]/5 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-1.5 flex-1 max-w-[60px] rounded-full bg-[#1C1C1C]/10 overflow-hidden">
                              <div 
                                className="h-full bg-[#C9A227]" 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-[#1C1C1C]/80 truncate">
                              {formatAddressWithYou(player, walletAddress)}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#1C1C1C]/70 tabular-nums text-right min-w-[55px]">
                            {attoToAlph(amount, 2)}
                          </span>
                          <span className="text-[11px] text-[#1C1C1C]/50 tabular-nums text-right min-w-[35px]">
                            {percentage}%
                          </span>
                          <span className="text-[11px] font-semibold text-[#C9A227] tabular-nums text-right min-w-[40px]">
                            {odds.toFixed(2)}x
                          </span>
                        </div>
                      )
                    })}
                </div>
                <p className="mt-1.5 text-[9px] italic text-[#1C1C1C]/40 text-center">
                  Odds show potential payout multiplier if player wins
                </p>
              </div>
            )}

            {betStatus.length > 0 && (
              <div className="mt-4 rounded border border-[#1C1C1C]/20 bg-white px-3 py-2 text-center text-xs text-[#1C1C1C]/80">
                {betStatus}
              </div>
            )}

            {/* Prediction window closed warning */}
            {isBettingWindowClosed && isRoundActive && (
              <div className="mt-4 rounded border border-[#C9A227]/40 bg-[#C9A227]/10 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-[#1C1C1C]">Prediction Window Closed</p>
                <p className="mt-1 text-[10px] text-[#1C1C1C]/60">
                  Prediction closes 30 minutes before the timer ends. Wait for the next round.
                </p>
              </div>
            )}

            <div className={`mt-4 space-y-2 ${isBettingWindowClosed ? 'pointer-events-none opacity-50' : ''}`}>
                <label className="block text-xs font-medium text-[#1C1C1C]/70">Target Address</label>
                <input
                  value={betTarget}
                  onChange={(event) => setBetTarget(event.target.value)}
                  placeholder="Paste any Alephium address"
                  disabled={isBettingWindowClosed}
                  className="w-full rounded border border-[#1C1C1C]/25 bg-white px-3 py-2 font-mono text-xs text-[#1C1C1C] focus:border-[#8B7355] focus:outline-none disabled:cursor-not-allowed"
                />
                <div className="rounded border border-[#1C1C1C]/15 bg-white/70 p-2">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C]/60">Eligible Players (latest first)</p>
                  <div className="max-h-36 overflow-auto">
                    {selectablePlayers.length === 0 ? (
                      <p className="text-xs text-[#1C1C1C]/50">No Played events yet.</p>
                    ) : (
                      selectablePlayers.map((player) => (
                        <button
                          key={player}
                          onClick={() => setBetTarget(player)}
                          className={`mb-1 block w-full rounded px-2 py-1 text-left font-mono text-xs ${cleanedBetTarget === player ? 'bg-[#8B7355]/20 text-[#1C1C1C]' : 'bg-white text-[#1C1C1C]/70 hover:bg-[#8B7355]/10'}`}
                        >
                          {formatAddressWithYou(player, walletAddress)} {player === stripAddressGroup(currentLeader) ? '• Leader' : ''}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                {betTarget.trim().length > 0 && !isBetTargetValidAddress && (
                  <p className="text-[11px] text-red-600">Invalid Alephium address.</p>
                )}
                {isBetTargetValidAddress && !isTargetInRecentPlayers && (
                  <p className="text-[11px] text-[#1C1C1C]/60">
                    Address is valid but not in recent active players. Transaction may fail if target is ineligible this round.
                  </p>
                )}

                <label className="mt-2 block text-xs font-medium text-[#1C1C1C]/70">Bet Amount</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    enterKeyHint="done"
                    value={betAmountInput}
                    onChange={(event) => setBetAmountInput(sanitizeBetAmountInput(event.target.value))}
                    placeholder="0.1"
                    disabled={isBettingWindowClosed}
                    className="w-full rounded border border-[#1C1C1C]/25 bg-white px-3 py-2 pr-16 text-sm text-[#1C1C1C] focus:border-[#8B7355] focus:outline-none disabled:cursor-not-allowed"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#1C1C1C]/55">ALPH</span>
                </div>
                {betAmountInput.trim().length > 0 && !isBetAmountPositive && (
                  <p className="text-[11px] text-red-600">Bet amount must be greater than 0.</p>
                )}
                {betAmountInput.trim().length > 0 && isBetAmountPositive && !isBetAmountValid && (
                  <p className="text-[11px] text-red-600">Minimum amount is {attoToAlph(minBet, 2)} ALPH.</p>
                )}
              </div>

            {/* Selected player info */}
            {cleanedBetTarget.length > 0 && (
              <div className="mt-3 rounded border border-[#C9A227]/20 bg-[#C9A227]/5 px-3 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#1C1C1C]/60">Selected:</span>
                  <span className="font-mono text-[#1C1C1C]/80">{formatAddressWithYou(cleanedBetTarget, walletAddress)}</span>
                </div>
                {selectedPlayerPool > 0n && (
                  <>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-[#1C1C1C]/60">Current pool on player:</span>
                      <span className="text-[#1C1C1C]/80">{attoToAlph(selectedPlayerPool, 2)} ALPH</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-[#1C1C1C]/60">Current odds:</span>
                      <span className="font-semibold text-[#C9A227]">
                        {(Number(totalBettingPool * 100n / selectedPlayerPool) / 100).toFixed(2)}x
                      </span>
                    </div>
                  </>
                )}
                {selectedPlayerPool === 0n && (
                  <div className="flex items-center justify-between text-[11px] mt-1">
                    <span className="text-[#1C1C1C]/60">No bets yet</span>
                    <span className="text-[#C9A227]">Be the first!</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 text-center text-[10px] text-[#1C1C1C]/55">
              Min prediction: {attoToAlph(minBet, 2)} ALPH
              {!isBettingWindowClosed && payoutQuote > 0n && betAmount !== null && betAmount > 0n && (
                <span className="ml-2 rounded bg-[#C9A227]/15 px-2 py-0.5 font-semibold text-[#C9A227]">
                  Est. payout: {attoToAlph(payoutQuote, 2)} ALPH ({(Number(payoutQuote * 100n / betAmount) / 100).toFixed(2)}x)
                </span>
              )}
              <span className="ml-2 italic text-[#1C1C1C]/45">Estimate moves as others bet.</span>
            </div>
            {shouldShowActiveBetPanel && activeBet && (
              <div className="mt-4 rounded border border-[#8B7355]/35 bg-[#8B7355]/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/65">Active Prediction</p>
                <p className="mt-1 text-[11px] text-[#1C1C1C]/75">
                  {activeBet.status === 'pending' ? 'Pending confirmation...' : 'Confirmed on-chain.'}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                  <p><span className="text-[#1C1C1C]/55">Amount:</span> {attoToAlph(activeBet.amount, 2)} ALPH</p>
                  <p><span className="text-[#1C1C1C]/55">Target:</span> <span className="font-mono">{formatAddressWithYou(activeBet.target, walletAddress)}</span></p>
                  <p><span className="text-[#1C1C1C]/55">Est. payout:</span> {attoToAlph(activeBetQuote, 2)} ALPH</p>
                </div>
                <p className="mt-2 text-[10px] italic text-[#1C1C1C]/45">Estimate refreshes every 15 seconds and changes as others bet.</p>
              </div>
            )}

            <div className="mt-5">
              <button
                onClick={placeBet}
                disabled={!canPlaceBet || isBusy || isBettingWindowClosed}
                className="w-full rounded border border-[#8B7355] bg-[#8B7355]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placingBet ? 'Submitting...' : isBettingWindowClosed ? 'Prediction Closed' : hasMyBet ? 'Update Prediction' : 'Place Prediction'}
              </button>
            </div>

            {showFinalizeRoundCta && finalizeCtaRoundId > 0n && (
              <div className="mt-4 rounded border border-[#1C1C1C]/20 bg-white/70 px-3 py-3">
                <p className="text-[11px] text-[#1C1C1C]/65">
                  Anyone can finalize an ended round. It costs a small gas fee.
                </p>
                <button
                  onClick={() => finalizeBettingRound(finalizeCtaRoundId)}
                  disabled={finalizingBetRound || isBusy}
                  className="mt-2 w-full rounded border border-[#1C1C1C]/30 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {finalizingBetRound ? 'Finalizing...' : `Finalize Round #${finalizeCtaRoundId.toString()}`}
                </button>
              </div>
            )}

            {lastSettledRoundId > 0n && isLastSettledRoundFinalized && hasMyLastSettledBet && myLastSettledBetTarget && (
              <div className="mt-4 rounded border border-[#C9A227]/35 bg-[#C9A227]/8 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/65">Last Settled Round #{lastSettledRoundId.toString()}</p>
                <p className="mt-1 text-[11px] text-[#1C1C1C]/70">
                  You backed {formatAddressWithYou(myLastSettledBetTarget, walletAddress)} with {attoToAlph(myLastSettledBetAmount, 2)} ALPH.
                </p>
                {didWinLastSettledRound ? (
                  <>
                    <p className="mt-1 text-[11px] text-[#1C1C1C]/80">
                      Winner matched your pick. Claimable payout: <span className="font-semibold text-[#C9A227]">{attoToAlph(claimablePayout, 2)} ALPH</span>
                    </p>
                    {!hasClaimedLastSettledRound ? (
                      <button
                        onClick={() => claimBet(lastSettledRoundId)}
                        disabled={isBusy}
                        className="mt-2 w-full rounded border border-[#C9A227] bg-[#C9A227]/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claimingBet ? 'Claiming...' : 'Claim'}
                      </button>
                    ) : (
                      <p className="mt-2 text-[11px] text-[#1C1C1C]/60">Payout already claimed: {attoToAlph(lastSettledHistory?.payout ?? 0n, 2)} ALPH.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-[#1C1C1C]/60">
                    Round finalized. Winning address: {lastSettledWinner ? formatAddressWithYou(lastSettledWinner, walletAddress) : '—'}. You did not win this round.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">My Last 10 Rounds</p>
              <div className="max-h-56 overflow-auto rounded border border-[#1C1C1C]/15 bg-white/70 p-2">
                {myBetHistory.length === 0 ? (
                  <p className="text-xs text-[#1C1C1C]/50">No bets yet from this wallet.</p>
                ) : (
                  myBetHistory.map((item) => (
                    <div
                      key={item.roundId.toString()}
                      className={`mb-2 rounded border p-2 ${item.finalized ? (item.winner && stripAddressGroup(item.winner) === stripAddressGroup(item.target) ? 'border-green-200 bg-green-50/70' : 'border-red-200 bg-red-50/70') : 'border-[#1C1C1C]/10 bg-white'}`}
                    >
                      <p className="text-[11px] text-[#1C1C1C]/80">
                        Round #{item.roundId.toString()} • {attoToAlph(item.amount, 2)} ALPH on {formatAddressWithYou(item.target, walletAddress)}
                      </p>
                      <p className="text-[10px] text-[#1C1C1C]/55">
                        {item.finalized && (item.winner && stripAddressGroup(item.winner) === stripAddressGroup(item.target) ? 'Won' : 'Lost')}
                        {item.finalized ? ' • ' : ''}
                        {item.finalized ? `Finalized${item.winner ? ` • Winner ${formatAddressWithYou(item.winner, walletAddress)}` : ''}` : 'Not finalized yet'}
                        {item.claimed ? ` • Claimed ${attoToAlph(item.payout, 2)} ALPH` : ''}
                      </p>
                      <div className="mt-1 flex gap-2">
                        <button
                          onClick={() => finalizeBettingRound(item.roundId)}
                          disabled={item.finalized || isBusy || (item.roundId === currentRoundId && isRoundActive && !isExpired)}
                          className="rounded border border-[#1C1C1C]/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {(item.roundId === currentRoundId && isRoundActive && !isExpired) ? 'Running' : item.finalized ? 'Done' : 'Finalize'}
                        </button>
                        <button
                          onClick={() => claimBet(item.roundId)}
                          disabled={!item.finalized || item.claimed || isBusy}
                          className="rounded border border-[#C9A227] bg-[#C9A227]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Claim
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {activePage === 'instructions' && (
          <div className="w-full max-w-4xl rounded-sm border-4 border-[#8B7355] bg-[#F5F0E8] px-6 py-8 shadow-2xl sm:px-10 lg:max-w-5xl lg:px-12 xl:max-w-6xl">
            <h2 className="font-roman text-2xl font-semibold text-[#1C1C1C] mb-6 text-center">How to Play</h2>
            
            <div className="space-y-6 text-sm text-[#1C1C1C]/80">
              <section>
                <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">The Game</h3>
                <p className="mb-2">
                  The hALPHing is a timer-halving survival game on Alephium blockchain. A countdown timer starts at ~2026 years. 
                  Each time someone plays, the timer is <strong>halved</strong> and that player becomes the current leader.
                </p>
                <p>
                  When the timer runs out, the last leader <strong>wins 80%</strong> of the pot. The remaining 20% seeds the next round.
                </p>
              </section>

              <section>
                <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">How to Enter</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Enter the Arena</strong> — Pay the entry fee to halve the timer (÷2) and become leader</li>
                  <li><strong>Double Down</strong> — Pay 2x the entry fee to quarter the timer (÷4) and become leader</li>
                </ul>
                <p className="mt-2 text-xs text-[#1C1C1C]/60">
                  The entry fee starts at 5 ALPH and increases by 1% after each round settles.
                </p>
              </section>

              <section>
                <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">Predicting</h3>
                <p>
                  You can also bet on who you think will win the current round. Place bets on any player who has entered the arena.
                  If your chosen player wins, you receive a proportional share of the betting pool based on your stake.
                </p>
              </section>

              <section>
                <h3 className="font-roman text-lg font-semibold text-[#C9A227] mb-2">Getting ALPH</h3>
                <p className="mb-2">To play, you need ALPH (Alephium's native token). Here's how to get some:</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    <strong>Install a Wallet</strong> — Download the{' '}
                    <a href="https://alephium.org/#wallets" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">
                      Alephium Extension Wallet
                    </a>{' '}
                    for your browser
                  </li>
                  <li>
                    <strong>Buy ALPH</strong> — Purchase on exchanges like{' '}
                    <a href="https://www.gate.io/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">Gate.io</a>,{' '}
                    <a href="https://www.mexc.com/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">MEXC</a>, or{' '}
                    <a href="https://www.bitget.com/" target="_blank" rel="noopener noreferrer" className="text-[#C9A227] underline hover:text-[#8B7355]">Bitget</a>
                  </li>
                  <li>
                    <strong>Withdraw to Wallet</strong> — Send ALPH to your wallet address
                  </li>
                  <li>
                    <strong>Connect & Play</strong> — Click "Connect Wallet" and enter the arena!
                  </li>
                </ol>
              </section>

              <section className="border-t border-[#1C1C1C]/10 pt-4">
                <h3 className="font-roman text-lg font-semibold text-[#1C1C1C]/70 mb-2">Strategy Tips</h3>
                <ul className="list-disc list-inside space-y-1 text-[#1C1C1C]/60">
                  <li>The timer halves each play, so early plays are cheap but give lots of time for others</li>
                  <li>As the timer gets shorter, it becomes more valuable to be the last player</li>
                  <li>Double Down is riskier but quarters the timer, giving others less time to react</li>
                  <li>Watch the pot size — bigger pots attract more competition</li>
                </ul>
              </section>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-auto pt-8 text-center text-[10px] text-[#1C1C1C]/30">
          Built on Alephium
        </footer>
      </div>

      {/* Loading Overlay */}
      {isBusy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#FAF9F6]/90 backdrop-blur-sm">
          <div className="rounded-sm border-2 border-[#8B7355] bg-white px-10 py-8 text-center shadow-2xl max-w-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-[#C9A227] border-t-transparent" />
            <p className="font-roman text-lg font-medium text-[#1C1C1C]">
              {(playing || playingDouble) 
                ? (playingDouble ? 'Submitting double tribute...' : 'Submitting tribute...') 
                : placingBet
                  ? 'Placing bet...'
                  : finalizingBetRound
                    ? 'Finalizing round...'
                    : claimingBet
                      ? 'Claiming winnings...'
                      : 'Awaiting confirmation...'}
            </p>
            <p className="mt-1 text-sm text-[#1C1C1C]/50">
              Please wait
            </p>
            {pendingTxId && (
              <a
                href={`${EXPLORER_URL}/transactions/${pendingTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded border border-[#C9A227] px-3 py-1.5 text-xs font-medium text-[#C9A227] transition hover:bg-[#C9A227]/10"
              >
                View Transaction ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

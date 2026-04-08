import { useEffect, useMemo, useState } from 'react'
import { waitForTxConfirmation, web3 } from '@alephium/web3'
import { AlephiumConnectButton, useBalance, useWallet, useConnect } from '@alephium/web3-react'
import { CountdownGame } from '../../artifacts/ts/CountdownGame'
import { CountdownBettingMarket } from '../../artifacts/ts/CountdownBettingMarket'
import type { CountdownGameTypes } from '../../artifacts/ts/CountdownGame'
import { useQuery } from '@tanstack/react-query'
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

function alphToAtto(value: string): bigint | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const paddedFraction = (fraction + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole) * 10n ** 18n + BigInt(paddedFraction)
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
  const [activePage, setActivePage] = useState<'game' | 'betting'>('game')
  const [status, setStatus] = useState<string>('')
  const [betStatus, setBetStatus] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [playingDouble, setPlayingDouble] = useState(false)
  const [placingBet, setPlacingBet] = useState(false)
  const [finalizingBetRound, setFinalizingBetRound] = useState(false)
  const [claimingBet, setClaimingBet] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [betTarget, setBetTarget] = useState('')
  const [betAmountInput, setBetAmountInput] = useState('1')
  const [nowMs, setNowMs] = useState<bigint>(BigInt(Date.now()))
  const wallet = useWallet()
  const { balance, updateBalanceForTx } = useBalance()
  const { connect } = useConnect()

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
    enabled: CONTRACT_ADDRESS.length > 0,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: bettingState } = useQuery({
    queryKey: ['betting-state', NODE_URL, BETTING_CONTRACT_ADDRESS],
    queryFn: async () => {
      if (BETTING_CONTRACT_ADDRESS.length === 0) {
        throw new Error('Missing betting contract address')
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const nextState = await market.fetchState()
      return nextState.fields
    },
    enabled: BETTING_CONTRACT_ADDRESS.length > 0,
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
  const isRoundActive = state?.roundActive ?? false
  const currentRoundId = state?.currentRoundId ?? 0n
  const lastSettledRoundId = state?.lastSettledRoundId ?? 0n
  const minBet = CountdownBettingMarket.consts.MIN_BET
  const betAmount = alphToAtto(betAmountInput)
  const canPlaceBet =
    wallet !== undefined &&
    BETTING_CONTRACT_ADDRESS.length > 0 &&
    state?.roundActive === true &&
    betTarget.trim().length > 0 &&
    betAmount !== null &&
    betAmount >= minBet &&
    availableAlph >= betAmount

  const { data: myBet } = useQuery({
    queryKey: ['my-bet', NODE_URL, BETTING_CONTRACT_ADDRESS, currentRoundId.toString(), walletAddress],
    queryFn: async () => {
      if (!walletAddress || BETTING_CONTRACT_ADDRESS.length === 0) return null
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.getUserBet({
        args: {
          roundId: currentRoundId,
          bettor: walletAddress
        }
      })
      return result.returns
    },
    enabled: Boolean(walletAddress) && BETTING_CONTRACT_ADDRESS.length > 0 && currentRoundId > 0n,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: myLastSettledBet } = useQuery({
    queryKey: ['my-last-settled-bet', NODE_URL, BETTING_CONTRACT_ADDRESS, lastSettledRoundId.toString(), walletAddress],
    queryFn: async () => {
      if (!walletAddress || BETTING_CONTRACT_ADDRESS.length === 0 || lastSettledRoundId === 0n) return null
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.getUserBet({
        args: {
          roundId: lastSettledRoundId,
          bettor: walletAddress
        }
      })
      return result.returns
    },
    enabled: Boolean(walletAddress) && BETTING_CONTRACT_ADDRESS.length > 0 && lastSettledRoundId > 0n,
    refetchInterval: 4000,
    refetchIntervalInBackground: true
  })

  const { data: payoutQuote } = useQuery({
    queryKey: ['bet-quote', NODE_URL, BETTING_CONTRACT_ADDRESS, currentRoundId.toString(), betTarget, betAmountInput],
    queryFn: async () => {
      if (BETTING_CONTRACT_ADDRESS.length === 0 || betAmount === null || betAmount <= 0n || betTarget.trim().length === 0) {
        return null
      }
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const result = await market.view.quotePayout({
        args: {
          roundId: currentRoundId,
          target: betTarget.trim(),
          amount: betAmount
        }
      })
      return result.returns
    },
    enabled:
      BETTING_CONTRACT_ADDRESS.length > 0 &&
      currentRoundId > 0n &&
      betAmount !== null &&
      betAmount > 0n &&
      betTarget.trim().length > 0
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
              players.push(playerField.value)
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
            if (bettor !== walletAddress) continue
            byRound.set(roundId, {
              roundId: BigInt(roundId),
              target,
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
            finalizedByRound.set(roundId, { winner })
            const existing = byRound.get(roundId)
            if (existing) {
              existing.finalized = true
              existing.winner = winner
              byRound.set(roundId, existing)
            }
          } else if (event.eventIndex === CountdownBettingMarket.eventIndex.Claimed) {
            const roundId = event.fields[0]?.value
            const bettor = event.fields[1]?.value
            const payout = event.fields[3]?.value
            if (typeof roundId !== 'string' || typeof bettor !== 'string' || typeof payout !== 'string') continue
            if (bettor !== walletAddress) continue
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

      return items
    },
    enabled: Boolean(walletAddress) && BETTING_CONTRACT_ADDRESS.length > 0,
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

  const placeBet = async () => {
    if (wallet === undefined) {
      setBetStatus('Connect your wallet to place a bet.')
      return
    }
    if (BETTING_CONTRACT_ADDRESS.length === 0) {
      setBetStatus('Missing betting contract address.')
      return
    }
    if (!state?.roundActive) {
      setBetStatus('Betting is open only during an active round.')
      return
    }
    const target = betTarget.trim()
    if (target.length === 0) {
      setBetStatus('Enter the target address you want to back.')
      return
    }
    if (!selectablePlayers.includes(target)) {
      setBetStatus('Choose a player from the on-chain played list.')
      return
    }
    if (betAmount === null || betAmount < minBet) {
      setBetStatus(`Minimum bet is ${attoToAlph(minBet, 2)} ALPH.`)
      return
    }
    if (availableAlph < betAmount) {
      setBetStatus('Insufficient ALPH balance for this bet.')
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
      setBetStatus('Bet submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      setBetStatus('Bet confirmed on-chain.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBetStatus(`Bet failed: ${message}`)
    } finally {
      setPlacingBet(false)
      setConfirming(false)
    }
  }

  const finalizeBettingRound = async (roundId?: bigint) => {
    if (wallet === undefined || BETTING_CONTRACT_ADDRESS.length === 0) return
    const targetRoundId = roundId ?? lastSettledRoundId
    if (targetRoundId === 0n) {
      setBetStatus('No settled round yet to finalize.')
      return
    }
    setFinalizingBetRound(true)
    setConfirming(true)
    setBetStatus('')
    try {
      web3.setCurrentNodeProvider(NODE_URL, undefined, fetcher)
      const market = CountdownBettingMarket.at(BETTING_CONTRACT_ADDRESS)
      const signer = wallet.signer
      if (signer === undefined) throw new Error('Connected wallet has no signer.')
      const result = await market.transact.finalizeRound({
        signer,
        args: { roundId: targetRoundId },
        attoAlphAmount: 3n * 10n ** 17n
      })
      updateBalanceForTx(result.txId)
      setBetStatus('Finalize submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      setBetStatus(`Round #${targetRoundId.toString()} finalized for betting.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBetStatus(`Finalize failed: ${message}`)
    } finally {
      setFinalizingBetRound(false)
      setConfirming(false)
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
      setBetStatus('Claim submitted. Awaiting confirmation...')
      await waitForTxConfirmation(result.txId, 1, 1000)
      setBetStatus(`Claim settled for round #${targetRoundId.toString()}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBetStatus(`Claim failed: ${message}`)
    } finally {
      setClaimingBet(false)
      setConfirming(false)
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
  const hasMyBet = Boolean(myBet?.[0])
  const myBetTarget = hasMyBet ? myBet?.[1] : undefined
  const myBetAmount = hasMyBet ? myBet?.[2] ?? 0n : 0n
  const hasMyLastSettledBet = Boolean(myLastSettledBet?.[0])
  const myLastSettledBetTarget = hasMyLastSettledBet ? myLastSettledBet?.[1] : undefined
  const myLastSettledBetAmount = hasMyLastSettledBet ? myLastSettledBet?.[2] ?? 0n : 0n
  const isBusy = playing || playingDouble || placingBet || finalizingBetRound || claimingBet || confirming
  const selectablePlayers = useMemo(() => {
    if (!state?.currentLeader) return playedPlayers
    return playedPlayers.includes(state.currentLeader) ? playedPlayers : [state.currentLeader, ...playedPlayers]
  }, [playedPlayers, state?.currentLeader])

  useEffect(() => {
    if (betTarget.length > 0) return
    if (selectablePlayers.length === 0) return
    setBetTarget(selectablePlayers[0])
  }, [betTarget, selectablePlayers])

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
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setActivePage('game')}
              className={`rounded border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${activePage === 'game' ? 'border-[#8B7355] bg-[#8B7355]/15 text-[#1C1C1C]' : 'border-[#1C1C1C]/25 bg-white/50 text-[#1C1C1C]/70'}`}
            >
              Game
            </button>
            <button
              onClick={() => setActivePage('betting')}
              className={`rounded border px-4 py-1 text-xs font-semibold uppercase tracking-wider ${activePage === 'betting' ? 'border-[#8B7355] bg-[#8B7355]/15 text-[#1C1C1C]' : 'border-[#1C1C1C]/25 bg-white/50 text-[#1C1C1C]/70'}`}
            >
              Betting
            </button>
          </div>
        </div>

        {activePage === 'game' && (
          <>
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
                  <p>
                    <span className="font-semibold">Time's Up!</span> {state ? formatAddress(state.currentLeader) : '—'} wins {attoToAlph(prizePot, 2)} ALPH.
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
            <div className="mt-8 w-full max-w-xl">
              <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-[#C9A227]/60 to-transparent" />
              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">Prize Pot (80%)</p>
                  <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">{attoToAlph(prizePot, 2)}</p>
                  <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
                </div>
                <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">Savings Pot (20%)</p>
                  <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">{attoToAlph(totalSavings, 2)}</p>
                  <p className="text-xs text-[#1C1C1C]/50">ALPH</p>
                </div>
              </div>
            </div>
          </>
        )}

        {activePage === 'betting' && (
          <div className="w-full max-w-2xl rounded-sm border-4 border-[#8B7355] bg-[#F5F0E8] px-6 py-8 shadow-2xl sm:px-10">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#1C1C1C]/70">On-chain Winner Betting</p>
            <p className="mt-1 text-center text-[10px] italic text-[#1C1C1C]/50">
              Round #{currentRoundId.toString()} • Fee {bettingState ? Number(bettingState.protocolFeeBps) / 100 : 2}%
            </p>
            <p className="mt-1 text-center text-[10px] italic text-[#1C1C1C]/50">
              Last settled round: #{lastSettledRoundId.toString()}
            </p>

            {betStatus.length > 0 && (
              <div className="mt-4 rounded border border-[#1C1C1C]/20 bg-white px-3 py-2 text-center text-xs text-[#1C1C1C]/80">
                {betStatus}
              </div>
            )}

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-medium text-[#1C1C1C]/70">Choose Player (from Played events)</label>
              <select
                value={betTarget}
                onChange={(event) => setBetTarget(event.target.value)}
                className="w-full rounded border border-[#1C1C1C]/25 bg-white px-3 py-2 font-mono text-xs text-[#1C1C1C] focus:border-[#8B7355] focus:outline-none"
              >
                {selectablePlayers.length === 0 && <option value="">No players yet</option>}
                {selectablePlayers.map((player) => (
                  <option key={player} value={player}>
                    {formatAddress(player)}
                  </option>
                ))}
              </select>

              <input
                value={betAmountInput}
                onChange={(event) => setBetAmountInput(event.target.value)}
                placeholder="Bet amount (ALPH)"
                className="w-full rounded border border-[#1C1C1C]/25 bg-white px-3 py-2 text-sm text-[#1C1C1C] focus:border-[#8B7355] focus:outline-none"
              />
            </div>

            <div className="mt-3 text-center text-[10px] text-[#1C1C1C]/55">
              Min bet: {attoToAlph(minBet, 2)} ALPH
              {payoutQuote !== null && payoutQuote !== undefined && <span> • Est. payout: {attoToAlph(payoutQuote, 2)} ALPH</span>}
            </div>

            {hasMyBet && myBetTarget && (
              <p className="mt-2 text-center text-[10px] text-[#1C1C1C]/60">
                Your bet: {attoToAlph(myBetAmount, 2)} ALPH on {formatAddress(myBetTarget)}
              </p>
            )}
            {hasMyLastSettledBet && myLastSettledBetTarget && (
              <p className="mt-1 text-center text-[10px] text-[#1C1C1C]/60">
                Last settled bet: {attoToAlph(myLastSettledBetAmount, 2)} ALPH on {formatAddress(myLastSettledBetTarget)}
              </p>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={placeBet}
                disabled={!canPlaceBet || isBusy || selectablePlayers.length === 0}
                className="rounded border border-[#8B7355] bg-[#8B7355]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placingBet ? 'Placing...' : 'Place Bet'}
              </button>
              <button
                onClick={() => finalizeBettingRound()}
                disabled={!walletAddress || BETTING_CONTRACT_ADDRESS.length === 0 || lastSettledRoundId === 0n || isBusy}
                className="rounded border border-[#1C1C1C]/30 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {finalizingBetRound ? 'Finalizing...' : 'Finalize Betting'}
              </button>
              <button
                onClick={() => claimBet()}
                disabled={!walletAddress || BETTING_CONTRACT_ADDRESS.length === 0 || lastSettledRoundId === 0n || isBusy}
                className="rounded border border-[#C9A227] bg-[#C9A227]/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimingBet ? 'Claiming...' : 'Claim'}
              </button>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">My Bets History</p>
              <div className="max-h-56 overflow-auto rounded border border-[#1C1C1C]/15 bg-white/70 p-2">
                {myBetHistory.length === 0 ? (
                  <p className="text-xs text-[#1C1C1C]/50">No bets yet from this wallet.</p>
                ) : (
                  myBetHistory.map((item) => (
                    <div key={item.roundId.toString()} className="mb-2 rounded border border-[#1C1C1C]/10 bg-white p-2">
                      <p className="text-[11px] text-[#1C1C1C]/80">
                        Round #{item.roundId.toString()} • {attoToAlph(item.amount, 2)} ALPH on {formatAddress(item.target)}
                      </p>
                      <p className="text-[10px] text-[#1C1C1C]/55">
                        {item.finalized ? `Finalized${item.winner ? ` • Winner ${formatAddress(item.winner)}` : ''}` : 'Not finalized yet'}
                        {item.claimed ? ` • Claimed ${attoToAlph(item.payout, 2)} ALPH` : ''}
                      </p>
                      <div className="mt-1 flex gap-2">
                        <button
                          onClick={() => finalizeBettingRound(item.roundId)}
                          disabled={item.finalized || isBusy}
                          className="rounded border border-[#1C1C1C]/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Finalize
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

            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60">Eligible Players (latest first)</p>
              <div className="max-h-44 overflow-auto rounded border border-[#1C1C1C]/15 bg-white/70 p-2">
                {selectablePlayers.length === 0 ? (
                  <p className="text-xs text-[#1C1C1C]/50">No Played events yet.</p>
                ) : (
                  selectablePlayers.map((player) => (
                    <button
                      key={player}
                      onClick={() => setBetTarget(player)}
                      className={`mb-1 block w-full rounded px-2 py-1 text-left font-mono text-xs ${betTarget === player ? 'bg-[#8B7355]/20 text-[#1C1C1C]' : 'bg-white text-[#1C1C1C]/70 hover:bg-[#8B7355]/10'}`}
                    >
                      {player}
                    </button>
                  ))
                )}
              </div>
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

import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Zap } from 'lucide-react'
import type { CountdownGameTypes } from '../../../artifacts/ts/CountdownGame'
import { RomanColumn } from '../components/RomanColumn'
import { attoToAlph, formatAddressWithYou } from '../lib/utils'
import type { TimerPart } from '../types'

type HomePageProps = {
  isLoading: boolean
  currentLeader: string
  walletAddress: string | undefined
  state: CountdownGameTypes.Fields | undefined
  timerParts: TimerPart[]
  halvedCount: number
  pot: bigint
  prizePot: bigint
  totalSavings: bigint
  currentPlayCost: bigint
  doublePlayCost: bigint
  isRoundActive: boolean
  isExpired: boolean
  status: string
  canPlay: boolean
  isBusy: boolean
  hasEnoughForSingle: boolean
  hasEnoughForDouble: boolean
  playing: boolean
  playingDouble: boolean
  confirming: boolean
  play: (isDouble?: boolean) => Promise<void>
  connect: () => void
  formatUsd: (attoAlph: bigint) => string
}

export function HomePage({
  isLoading,
  currentLeader,
  walletAddress,
  state,
  timerParts,
  halvedCount,
  pot,
  prizePot,
  totalSavings,
  currentPlayCost,
  doublePlayCost,
  isRoundActive,
  isExpired,
  status,
  canPlay,
  isBusy,
  hasEnoughForSingle,
  hasEnoughForDouble,
  playing,
  playingDouble,
  confirming,
  play,
  connect,
  formatUsd,
}: HomePageProps) {
  return (
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
                <p className="text-sm text-[#1C1C1C]/60">ALPH {formatUsd(pot) && <span className="text-[#C9A227]">({formatUsd(pot)})</span>}</p>
                <p className="mt-0.5 text-[10px] italic text-[#1C1C1C]/40">Total prize pool</p>
              </div>
              <div className="text-center">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-[#1C1C1C]/70">
                  Tributum
                </p>
                <p className="font-roman text-2xl font-semibold text-[#1C1C1C] sm:text-3xl">
                  {attoToAlph(currentPlayCost, 2)}
                </p>
                <p className="text-sm text-[#1C1C1C]/60">ALPH {formatUsd(currentPlayCost) && <span className="text-[#1C1C1C]/50">({formatUsd(currentPlayCost)})</span>}</p>
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
                  <span className="font-semibold">Time's Up!</span>{' '}
                  {currentLeader ? formatAddressWithYou(currentLeader, walletAddress) : '—'} wins {attoToAlph(prizePot, 2)} ALPH.
                </p>
                <p className="mt-1 text-[10px] italic text-[#1C1C1C]/50">
                  Click below to pay the winner and start a new round
                </p>
              </div>
            )}

            {/* No Round Active */}
            {!isRoundActive && !isExpired && (
              <div className="mb-4 rounded border border-[#8B7355]/40 bg-[#8B7355]/10 px-4 py-3 text-center text-sm text-[#1C1C1C]">
                <p className="font-semibold">The Coliseum is waiting for you</p>
                <p className="mt-1 text-[10px] italic text-[#1C1C1C]/50">
                  Be the first to start a new round and claim the throne
                </p>
              </div>
            )}

            {/* Play Buttons */}
            <div className="space-y-3">
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
                          : !isRoundActive
                            ? `Start a New Round — ${attoToAlph(currentPlayCost, 2)}`
                            : `Enter the Arena — ${attoToAlph(currentPlayCost, 2)}`}
              </button>

              {isRoundActive && !isExpired && (
                <>
                  <button
                    onClick={() => walletAddress ? play(true) : connect()}
                    disabled={walletAddress ? (!canPlay || isBusy || !hasEnoughForDouble) : false}
                    className="mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-sm border-2 border-[#C9A227] bg-[#C9A227]/10 px-8 py-3 font-roman text-sm font-semibold uppercase tracking-[0.2em] text-[#1C1C1C] transition-all duration-200 hover:bg-[#C9A227]/20 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                  >
                    <Zap size={16} className="text-[#C9A227]" />
                    {!walletAddress
                      ? 'Connect Wallet'
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
                </>
              )}
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
            <p className="text-xs text-[#1C1C1C]/50">ALPH {formatUsd(prizePot) && <span className="text-[#C9A227]">({formatUsd(prizePot)})</span>}</p>
          </div>
          <div className="rounded-sm border border-[#1C1C1C]/10 bg-white/60 p-4 text-center shadow-sm">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#1C1C1C]/50">Next Round Seed (20%)</p>
            <p className="font-roman text-xl font-semibold text-[#1C1C1C] sm:text-2xl">{attoToAlph(totalSavings, 2)}</p>
            <p className="text-xs text-[#1C1C1C]/50">ALPH {formatUsd(totalSavings) && <span className="text-[#1C1C1C]/40">({formatUsd(totalSavings)})</span>}</p>
            <p className="mt-0.5 text-[9px] italic text-[#1C1C1C]/40">Added to next round's pot</p>
          </div>
        </div>
      </div>
    </>
  )
}

import { attoToAlph, formatAddressWithYou, formatCompactTimer, sanitizeBetAmountInput, stripAddressGroup } from '../lib/utils'
import type { ActiveBetView, TimerPart, UserBetHistoryItem } from '../types'

type BettingPageProps = {
  // Game state
  currentRoundId: bigint
  pot: bigint
  isRoundActive: boolean
  currentLeader: string
  timerParts: TimerPart[]
  timeLeftMs: bigint
  lastSettledRoundId: bigint
  lastSettledWinner: string | undefined
  isExpired: boolean
  walletAddress: string | undefined

  // Betting form
  betTarget: string
  betAmountInput: string
  setBetTarget: (v: string) => void
  setBetAmountInput: (v: string) => void
  betAmount: bigint | null
  isBetAmountPositive: boolean
  isBetAmountValid: boolean
  isBetTargetValidAddress: boolean
  cleanedBetTarget: string
  isTargetInRecentPlayers: boolean
  minBet: bigint

  // Betting window
  bettingWindowOpen: boolean
  isBettingWindowClosed: boolean
  canPlaceBet: boolean
  isSameAsExistingBet: boolean

  // Actions state
  betStatus: string
  placingBet: boolean
  finalizingBetRound: boolean
  claimingBet: boolean
  isBusy: boolean
  hasMyBet: boolean

  // Pool / odds
  totalBettingPool: bigint
  bettingByPlayer: Map<string, bigint>
  topBetPlayer: { address: string; amount: bigint } | null
  selectablePlayers: string[]
  selectedPlayerPool: bigint
  payoutQuote: bigint

  // Active bet
  activeBet: ActiveBetView | null
  shouldShowActiveBetPanel: boolean
  activeBetQuote: bigint

  // Finalize CTA
  showFinalizeRoundCta: boolean
  finalizeCtaRoundId: bigint

  // Last settled round
  isLastSettledRoundFinalized: boolean
  hasMyLastSettledBet: boolean
  myLastSettledBetTarget: string | undefined
  myLastSettledBetAmount: bigint
  didWinLastSettledRound: boolean
  hasClaimedLastSettledRound: boolean
  claimablePayout: bigint
  lastSettledHistory: UserBetHistoryItem | undefined

  // History
  myBetHistory: UserBetHistoryItem[]

  // Actions
  placeBet: () => Promise<void>
  finalizeBettingRound: (roundId?: bigint) => Promise<void>
  claimBet: (roundId?: bigint) => Promise<void>

  // Format helpers
  formatUsd: (attoAlph: bigint) => string
}

export function BettingPage({
  currentRoundId,
  pot,
  isRoundActive,
  currentLeader,
  timerParts,
  timeLeftMs,
  lastSettledRoundId,
  lastSettledWinner,
  isExpired,
  walletAddress,
  betTarget,
  betAmountInput,
  setBetTarget,
  setBetAmountInput,
  betAmount,
  isBetAmountPositive,
  isBetAmountValid,
  isBetTargetValidAddress,
  cleanedBetTarget,
  isTargetInRecentPlayers,
  minBet,
  bettingWindowOpen,
  isBettingWindowClosed,
  canPlaceBet,
  isSameAsExistingBet,
  betStatus,
  placingBet,
  finalizingBetRound,
  claimingBet,
  isBusy,
  hasMyBet,
  totalBettingPool,
  bettingByPlayer,
  topBetPlayer,
  selectablePlayers,
  selectedPlayerPool,
  payoutQuote,
  activeBet,
  shouldShowActiveBetPanel,
  activeBetQuote,
  showFinalizeRoundCta,
  finalizeCtaRoundId,
  isLastSettledRoundFinalized,
  hasMyLastSettledBet,
  myLastSettledBetTarget,
  myLastSettledBetAmount,
  didWinLastSettledRound,
  hasClaimedLastSettledRound,
  claimablePayout,
  lastSettledHistory,
  myBetHistory,
  placeBet,
  finalizeBettingRound,
  claimBet,
  formatUsd,
}: BettingPageProps) {
  return (
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
            <p className="font-roman text-lg text-[#1C1C1C]">{attoToAlph(pot, 2)} ALPH {formatUsd(pot) && <span className="text-xs text-[#C9A227]">({formatUsd(pot)})</span>}</p>
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
          {formatUsd(totalBettingPool) && <p className="text-xs text-[#1C1C1C]/50">{formatUsd(totalBettingPool)}</p>}
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
          disabled={!canPlaceBet || isSameAsExistingBet || isBusy || isBettingWindowClosed}
          className="w-full rounded border border-[#8B7355] bg-[#8B7355]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1C1C1C] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placingBet ? 'Submitting...' : isBettingWindowClosed ? 'Prediction Closed' : isSameAsExistingBet ? 'Prediction Unchanged' : hasMyBet ? 'Update Prediction' : 'Place Prediction'}
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
  )
}

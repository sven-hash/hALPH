export type TimerPart = { value: string; unit: string }

export type UserBetHistoryItem = {
  roundId: bigint
  target: string
  amount: bigint
  finalized: boolean
  winner?: string
  claimed: boolean
  payout: bigint
}

export type StoredActiveBetStatus = 'pending' | 'confirmed' | 'claimed'

export type StoredActiveBet = {
  wallet: string
  roundId: string
  target: string
  amount: string
  status: StoredActiveBetStatus
  txId?: string
}

export type ActiveBetView = {
  roundId: bigint
  target: string
  amount: bigint
  status: StoredActiveBetStatus
}

export type AppPage = 'game' | 'betting' | 'instructions'

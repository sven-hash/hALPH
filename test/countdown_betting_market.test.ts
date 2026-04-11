import { TestContractParams, addressFromContractId, web3 } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { CountdownBettingMarket, CountdownBettingMarketTypes, CountdownGame, CountdownGameTypes } from '../artifacts/ts'

const ALPH = 10n ** 18n
const BET_AMOUNT = ALPH

function baseGameFields(): CountdownGameTypes.Fields {
  return {
    basePlayCost: 5n * ALPH,
    currentLeader: testAddress,
    currentPot: 10n * ALPH,
    currentDurationMs: 123n,
    deadlineMs: 9_999_999_999_999n,
    savingsPot: 0n,
    roundActive: true,
    currentPlayCost: 5n * ALPH,
    currentRoundId: 1n,
    lastSettledRoundId: 0n,
    lastSettledWinner: testAddress
  }
}

describe('CountdownBettingMarket', () => {
  let marketAddress: string
  let gameId: string
  let gameAddress: string
  let baseParams: TestContractParams<CountdownBettingMarketTypes.Fields, Record<string, never>, Partial<CountdownBettingMarketTypes.Maps>>

  beforeAll(() => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

    const marketId = randomContractId()
    gameId = randomContractId()
    marketAddress = addressFromContractId(marketId)
    gameAddress = addressFromContractId(gameId)

    baseParams = {
      contractAddress: marketAddress,
      initialFields: {
        game: gameId,
        carryOverPot: 0n
      },
      initialAsset: { alphAmount: 50n * ALPH },
      args: {}
    }
  })

  it('places a bet and stores user position', async () => {
    const gameState = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)

    const placed = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [gameState]
    })

    const placedEvent = placed.events.find((event) => event.name === 'BetPlaced')
    expect(placedEvent).toBeDefined()
    expect(placedEvent?.fields.amount).toEqual(BET_AMOUNT)

    const userBet = await CountdownBettingMarket.tests.getUserBet({
      ...baseParams,
      initialMaps: placed.maps,
      args: { roundId: 1n, bettor: testAddress }
    })
    expect(userBet.returns[0]).toEqual(true)
    expect(userBet.returns[1]).toEqual(testAddress)
    expect(userBet.returns[2]).toEqual(BET_AMOUNT)
  })

  it('finalizes then allows winning claim payout', async () => {
    const activeGame = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)
    const placed = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [activeGame]
    })

    const settledGame = CountdownGame.stateForTest(
      {
        ...baseGameFields(),
        roundActive: false,
        lastSettledRoundId: 1n,
        lastSettledWinner: testAddress
      },
      { alphAmount: 50n * ALPH },
      gameAddress,
      { settledWinnerByRound: new Map([[1n, testAddress]]) }
    )

    const finalized = await CountdownBettingMarket.tests.finalizeRound({
      ...baseParams,
      initialMaps: placed.maps,
      args: { roundId: 1n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }],
      existingContracts: [settledGame]
    })

    const finalizedEvent = finalized.events.find((event) => event.name === 'RoundFinalized')
    expect(finalizedEvent).toBeDefined()
    expect(finalizedEvent?.fields.roundId).toEqual(1n)
    const finalizedMarketState = finalized.contracts.find((state) => state.address === marketAddress)
    expect(finalizedMarketState).toBeDefined()

    const claimed = await CountdownBettingMarket.tests.claim({
      ...baseParams,
      initialMaps: finalized.maps,
      initialAsset: { alphAmount: 50n * ALPH },
      args: { roundId: 1n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }]
    })

    const claimedEvent = claimed.events.find((event) => event.name === 'Claimed')
    expect(claimedEvent).toBeDefined()
    expect(claimedEvent?.fields.payout).toEqual(BET_AMOUNT)
  })

  it('rejects finalize when game round is not settled yet', async () => {
    const activeGame = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)
    const placed = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [activeGame]
    })

    await expect(
      CountdownBettingMarket.tests.finalizeRound({
        ...baseParams,
        initialMaps: placed.maps,
        args: { roundId: 1n },
        inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }],
        existingContracts: [activeGame]
      })
    ).rejects.toThrow()
  })

  it('allows changing target and resizing stake in the same round', async () => {
    const gameState = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)

    const firstBet = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [gameState]
    })

    const otherTarget = addressFromContractId(randomContractId())
    const updated = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      initialMaps: firstBet.maps,
      args: { roundId: 1n, target: otherTarget, amount: BET_AMOUNT / 2n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }],
      existingContracts: [gameState]
    })

    const userBet = await CountdownBettingMarket.tests.getUserBet({
      ...baseParams,
      initialMaps: updated.maps,
      args: { roundId: 1n, bettor: testAddress }
    })
    expect(userBet.returns[0]).toEqual(true)
    expect(userBet.returns[1]).toEqual(otherTarget)
    expect(userBet.returns[2]).toEqual(BET_AMOUNT / 2n)
  })

  it('rejects bet updates in the last 30 minutes', async () => {
    const almostClosedGame = CountdownGame.stateForTest(
      {
        ...baseGameFields(),
        deadlineMs: 1_799_999n
      },
      { alphAmount: 50n * ALPH },
      gameAddress
    )
    await expect(
      CountdownBettingMarket.tests.placeBet({
        ...baseParams,
        args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
        blockTimeStamp: 0,
        inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
        existingContracts: [almostClosedGame]
      })
    ).rejects.toThrow()
  })

  it('accrues carry-over pot across rounds with no winners', async () => {
    const firstRoundActive = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)
    const firstBet = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [firstRoundActive]
    })

    const winnerRound1 = addressFromContractId(randomContractId())
    const firstRoundSettled = CountdownGame.stateForTest(
      {
        ...baseGameFields(),
        roundActive: false,
        lastSettledRoundId: 1n,
        lastSettledWinner: winnerRound1,
        currentRoundId: 2n
      },
      { alphAmount: 50n * ALPH },
      gameAddress,
      { settledWinnerByRound: new Map([[1n, winnerRound1]]) }
    )

    const finalizedRound1 = await CountdownBettingMarket.tests.finalizeRound({
      ...baseParams,
      initialMaps: firstBet.maps,
      args: { roundId: 1n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }],
      existingContracts: [firstRoundSettled]
    })

    const marketAfterRound1 = finalizedRound1.contracts.find((state) => state.address === marketAddress) as CountdownBettingMarketTypes.State
    expect(marketAfterRound1).toBeDefined()
    expect(marketAfterRound1.fields.carryOverPot).toEqual(BET_AMOUNT)

    const secondRoundActive = CountdownGame.stateForTest(
      {
        ...baseGameFields(),
        roundActive: true,
        currentRoundId: 2n,
        deadlineMs: 9_999_999_999_999n
      },
      { alphAmount: 50n * ALPH },
      gameAddress
    )

    const secondRoundBetAmount = 2n * ALPH
    const secondBet = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      initialFields: marketAfterRound1.fields,
      initialMaps: finalizedRound1.maps,
      args: { roundId: 2n, target: testAddress, amount: secondRoundBetAmount },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 4n * ALPH } }],
      existingContracts: [secondRoundActive]
    })
    const marketAfterSecondBet = secondBet.contracts.find((state) => state.address === marketAddress) as CountdownBettingMarketTypes.State
    expect(marketAfterSecondBet).toBeDefined()

    const poolsRound2 = await CountdownBettingMarket.tests.getRoundPools({
      ...baseParams,
      initialFields: marketAfterSecondBet.fields,
      initialMaps: secondBet.maps,
      args: { roundId: 2n, target: testAddress },
      existingContracts: [secondRoundActive]
    })
    expect(poolsRound2.returns[0]).toEqual(BET_AMOUNT + secondRoundBetAmount)
    expect(poolsRound2.returns[1]).toEqual(secondRoundBetAmount)

    const winnerRound2 = addressFromContractId(randomContractId())
    const secondRoundSettled = CountdownGame.stateForTest(
      {
        ...baseGameFields(),
        roundActive: false,
        lastSettledRoundId: 2n,
        lastSettledWinner: winnerRound2,
        currentRoundId: 3n
      },
      { alphAmount: 50n * ALPH },
      gameAddress,
      { settledWinnerByRound: new Map([[2n, winnerRound2]]) }
    )

    const finalizedRound2 = await CountdownBettingMarket.tests.finalizeRound({
      ...baseParams,
      initialFields: marketAfterSecondBet.fields,
      initialMaps: secondBet.maps,
      args: { roundId: 2n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }],
      existingContracts: [secondRoundSettled]
    })

    const marketAfterRound2 = finalizedRound2.contracts.find((state) => state.address === marketAddress) as CountdownBettingMarketTypes.State
    expect(marketAfterRound2).toBeDefined()
    expect(marketAfterRound2.fields.carryOverPot).toEqual(BET_AMOUNT + secondRoundBetAmount)
  })
})

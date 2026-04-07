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
  let baseParams: TestContractParams<CountdownBettingMarketTypes.Fields, Record<string, never>, CountdownBettingMarketTypes.Maps>

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
        protocolFeeBps: 200n,
        feePot: 0n
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
      gameAddress
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
    expect((finalizedMarketState as CountdownBettingMarketTypes.State).fields.feePot).toEqual((BET_AMOUNT * 200n) / 10000n)

    const claimed = await CountdownBettingMarket.tests.claim({
      ...baseParams,
      initialMaps: finalized.maps,
      initialAsset: { alphAmount: 50n * ALPH },
      args: { roundId: 1n },
      inputAssets: [{ address: testAddress, asset: { alphAmount: ALPH } }]
    })

    const claimedEvent = claimed.events.find((event) => event.name === 'Claimed')
    expect(claimedEvent).toBeDefined()
    expect(claimedEvent?.fields.payout).toEqual((BET_AMOUNT * 9800n) / 10000n)
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

  it('rejects changing target within the same round', async () => {
    const gameState = CountdownGame.stateForTest(baseGameFields(), { alphAmount: 50n * ALPH }, gameAddress)

    const firstBet = await CountdownBettingMarket.tests.placeBet({
      ...baseParams,
      args: { roundId: 1n, target: testAddress, amount: BET_AMOUNT },
      inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
      existingContracts: [gameState]
    })

    const otherTarget = addressFromContractId(randomContractId())
    await expect(
      CountdownBettingMarket.tests.placeBet({
        ...baseParams,
        initialMaps: firstBet.maps,
        args: { roundId: 1n, target: otherTarget, amount: BET_AMOUNT },
        inputAssets: [{ address: testAddress, asset: { alphAmount: 3n * ALPH } }],
        existingContracts: [gameState]
      })
    ).rejects.toThrow()
  })
})

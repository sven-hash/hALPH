import { TestContractParams, addressFromContractId, web3 } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { CountdownGame, CountdownGameTypes } from '../artifacts/ts'

const PLAY_COST = 10n ** 18n
const INITIAL_DURATION_MS = 63891936000000n

describe('CountdownGame', () => {
  let testContractAddress: string
  let baseParams: TestContractParams<CountdownGameTypes.Fields, Record<string, never>>

  beforeAll(() => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

    const testContractId = randomContractId()
    testContractAddress = addressFromContractId(testContractId)
    baseParams = {
      address: testContractAddress,
      initialAsset: { alphAmount: 200n * PLAY_COST },
      initialFields: {
        currentLeader: testAddress,
        currentPot: 0n,
        currentDurationMs: 0n,
        deadlineMs: 0n,
        nextRoundSeed: 0n,
        savingsPot: 0n,
        roundActive: false
      },
      testArgs: {},
      inputAssets: [{ address: testAddress, asset: { alphAmount: 5n * PLAY_COST } }]
    }
  })

  it('starts a new round at 2026 years with 1 ALPH in pot', async () => {
    const result = await CountdownGame.tests.play(baseParams)
    const state = result.contracts[0] as CountdownGameTypes.State

    expect(state.fields.roundActive).toEqual(true)
    expect(state.fields.currentLeader).toEqual(testAddress)
    expect(state.fields.currentPot).toEqual(PLAY_COST)
    expect(state.fields.currentDurationMs).toEqual(INITIAL_DURATION_MS)
    expect(state.fields.deadlineMs).toBeGreaterThan(0n)
    expect(state.fields.nextRoundSeed).toEqual(0n)
    expect(state.fields.savingsPot).toEqual(0n)
  })

  it('halves remaining timer on each play and updates leader', async () => {
    const result = await CountdownGame.tests.play({
      ...baseParams,
      initialFields: {
        ...baseParams.initialFields,
        currentLeader: testAddress,
        currentPot: 5n * PLAY_COST,
        currentDurationMs: 8n,
        deadlineMs: 2n ** 255n,
        roundActive: true
      }
    })

    const state = result.contracts[0] as CountdownGameTypes.State
    expect(state.fields.currentLeader).toEqual(testAddress)
    expect(state.fields.currentPot).toEqual(6n * PLAY_COST)
    expect(state.fields.currentDurationMs).toEqual(4n)
  })

  it('settles expired round into 80/10/10 then starts next round', async () => {
    const previousLeader = testAddress

    const result = await CountdownGame.tests.play({
      ...baseParams,
      initialFields: {
        ...baseParams.initialFields,
        currentLeader: previousLeader,
        currentPot: 10n * PLAY_COST,
        currentDurationMs: 50n,
        deadlineMs: 1n,
        nextRoundSeed: 0n,
        savingsPot: 0n,
        roundActive: true
      }
    })

    const state = result.contracts[0] as CountdownGameTypes.State
    expect(state.fields.currentLeader).toEqual(testAddress)
    expect(state.fields.currentPot).toEqual(2n * PLAY_COST)
    expect(state.fields.currentDurationMs).toEqual(INITIAL_DURATION_MS)
    expect(state.fields.nextRoundSeed).toEqual(0n)
    expect(state.fields.savingsPot).toEqual(PLAY_COST)
    expect(state.fields.roundActive).toEqual(true)
  })
})

import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { CountdownGame } from '../artifacts/ts'

const deployCountdownGame: DeployFunction<Settings> = async (
  deployer: Deployer,
  _network: Network<Settings>
): Promise<void> => {
  const result = await deployer.deployContract(CountdownGame, {
    initialFields: {
      currentLeader: deployer.account.address,
      currentPot: 0n,
      currentDurationMs: 0n,
      deadlineMs: 0n,
      nextRoundSeed: 0n,
      savingsPot: 0n,
      roundActive: false
    }
  })

  console.log('CountdownGame contract id: ' + result.contractInstance.contractId)
  console.log('CountdownGame contract address: ' + result.contractInstance.address)
}

export default deployCountdownGame

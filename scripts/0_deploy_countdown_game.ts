import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { CountdownGame } from '../artifacts/ts'

const deployCountdownGame: DeployFunction<Settings> = async (
  deployer: Deployer,
  _network: Network<Settings>
): Promise<void> => {
  const result = await deployer.deployContract(CountdownGame, {
    initialFields: {
      basePlayCost: 5n * 10n ** 18n,
      currentLeader: deployer.account.address,
      currentPot: 0n,
      currentDurationMs: 0n,
      deadlineMs: 0n,
      savingsPot: 0n,
      roundActive: false,
      currentPlayCost: 5n * 10n ** 18n
    }
  })

  console.log('CountdownGame contract id: ' + result.contractInstance.contractId)
  console.log('CountdownGame contract address: ' + result.contractInstance.address)
}

export default deployCountdownGame

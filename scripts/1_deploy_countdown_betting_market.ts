import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { CountdownBettingMarket } from '../artifacts/ts'

const deployCountdownBettingMarket: DeployFunction<Settings> = async (
  deployer: Deployer,
  _network: Network<Settings>
): Promise<void> => {
  const game = deployer.getDeployContractResult('CountdownGame')
  const result = await deployer.deployContract(CountdownBettingMarket, {
    initialFields: {
      game: game.contractInstance.contractId,
      protocolFeeBps: 200n,
      feePot: 0n
    }
  })

  console.log('CountdownBettingMarket contract id: ' + result.contractInstance.contractId)
  console.log('CountdownBettingMarket contract address: ' + result.contractInstance.address)
}

export default deployCountdownBettingMarket

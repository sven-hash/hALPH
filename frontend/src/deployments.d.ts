declare module '../../deployments/.deployments.testnet.json' {
  interface ContractInstance {
    address: string
    contractId: string
    groupIndex: number
  }

  interface ContractDeployment {
    txId: string
    unsignedTx: string
    signature: string
    gasPrice: string
    gasAmount: number
    blockHash: string
    codeHash: string
    contractInstance: ContractInstance
  }

  interface Deployment {
    deployerAddress: string
    contracts: {
      CountdownGame?: ContractDeployment
      [key: string]: ContractDeployment | undefined
    }
    scripts: Record<string, unknown>
    migrations: Record<string, unknown>
  }

  const deployments: Deployment | Deployment[]
  export default deployments
}

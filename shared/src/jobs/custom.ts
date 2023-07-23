import { exit } from 'process'
import { abiRedis, saveContractGroupAbi } from '..'

const groups = [
    ['allo.ProjectRegistry', '1'],
    ['station.Membership', '1'],
    ['allo.QuadraticFundingVotingStrategyFactory', '1'],
    ['allo.RoundImplementation', '1'],
    ['allo.ProgramFactory', '1'],
    ['allo.Round', '1'],
    ['allo.RoundFactory', '1'],
    ['allo.Program', '1'],
    ['allo.ProgramImplementation', '1'],
    ['station.MembershipFactory', '5'],
    ['ivy.SmartWalletInitializer', '137'],
    ['jia.BaseCreditPool', '137'],
    ['test.Lock', '80001'],
]

async function perform() {
    await abiRedis.connect()
    for (const [group, chainId] of groups) {
        const abiStr = (await abiRedis?.hGet(`contract-groups-${chainId}`, group)) || null
        const abi = abiStr ? JSON.parse(abiStr) : []
        await saveContractGroupAbi(group, abi)
    }
    exit(0)
}

export default perform

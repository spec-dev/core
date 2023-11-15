import { exit } from 'process'
import { abiRedis, getContractGroupAbi, saveContractGroupAbi } from '..'

async function perform() {
    await abiRedis.connect()

    const merkle = await getContractGroupAbi('allov2.MerkleDistribution')
    await saveContractGroupAbi('allov2.MerkleDistributionStrategy', merkle)

    const rfpSimple = await getContractGroupAbi('allov2.RFPSimple')
    await saveContractGroupAbi('allov2.RFPSimpleStrategy', rfpSimple)

    const QVSimple = await getContractGroupAbi('allov2.QVSimple')
    await saveContractGroupAbi('allov2.QVSimpleStrategy', QVSimple)

    exit(0)
}

export default perform

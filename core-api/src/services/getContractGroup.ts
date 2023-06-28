import { CoreDB, Namespace, getContractInstancesInNamespace } from '../../../shared'

// import { CoreDB } from '../dataSource'

const namespaces = () => CoreDB.getRepository(Namespace)

// join -> contracts-> namespaces
// getContractInstancesInNamespace
// contractInstanceServices.ts

async function getContractGroup(group: string) {
    console.log('req.query', group)
    const returnGroup = await getContractInstancesInNamespace(group)
    console.log(returnGroup)
    // await CoreDB.query(`SELECT * FROM namespaces WHERE name LIKE '%${group}%`)
}

export default getContractGroup

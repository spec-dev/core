import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'
import { StringKeyMap } from '../../../types'
import { range, average } from '../../../utils/math'
import { getDecodeJobProgress, getDecodeJobRangeCount } from '../../redis'

export enum ContractRegistrationJobStatus {
    Created = 'created',
    Decoding = 'decoding',
    Indexing = 'indexing',
    Complete = 'complete',
}

/**
 * Registration job for a group of contract instances.
 */
@Entity('contract_registration_jobs')
export class ContractRegistrationJob {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column()
    nsp: string

    @Column('json', { nullable: true })
    groups: StringKeyMap[]

    @Column('varchar')
    status: ContractRegistrationJobStatus

    @Column({ default: false })
    failed: boolean

    @Column('text', { nullable: true })
    error: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @UpdateDateColumn({
        type: 'timestamptz',
        name: 'updated_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
        onUpdate: `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    updatedAt: Date

    async view() {
        const groups = []
        for (const group of this.groups || []) {
            const instances = (group.instances || []).map((key) => {
                const [chainId, address] = key.split(':')
                return { chainId, address }
            })

            const groupInstances = []
            for (const instance of instances) {
                const numRangeJobsKey = [
                    this.uid,
                    group.name,
                    instance.chainId,
                    instance.address,
                    'num-range-jobs',
                ].join(':')
                const numRangeJobs = await getDecodeJobRangeCount(numRangeJobsKey)

                if (!numRangeJobs) {
                    groupInstances.push({
                        chainId: instance.chainId,
                        address: instance.address,
                        progress: 0,
                    })
                    continue
                }

                const progressKeys = range(0, numRangeJobs - 1).map((i) =>
                    [this.uid, group.name, instance.chainId, instance.address, i].join(':')
                )
                const progressData = await Promise.all(progressKeys.map(getDecodeJobProgress))

                groupInstances.push({
                    chainId: instance.chainId,
                    address: instance.address,
                    progress: average(progressData),
                })
            }

            groups.push({
                name: group.name,
                instances: groupInstances.sort((a, b) => Number(a.chainId) - Number(b.chainId)),
            })
        }

        return {
            uid: this.uid,
            nsp: this.nsp,
            groups,
            status: this.status,
            failed: this.failed,
            error: this.error,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        }
    }
}

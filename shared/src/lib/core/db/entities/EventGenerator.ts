import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm'

export enum EventGeneratorParentType {
    Contract = 'contract',
}

/**
 * Function that potentially generates Spec event(s).
 */
@Entity('event_generators')
@Index(['parentId', 'discriminator'])
export class EventGenerator {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    uid: string

    @Column('int8', { name: 'parent_id' })
    parentId: number

    @Column()
    discriminator: EventGeneratorParentType

    @Column()
    name: string

    @Column()
    url: string

    @Column('json', { nullable: true })
    metadata: object

    // Comma delimited array of event version uids
    @Column('varchar', { name: 'event_versions' })
    eventVersions: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date
}

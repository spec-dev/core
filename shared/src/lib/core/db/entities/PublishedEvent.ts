import {
    Entity,
    Column,
    Index,
    PrimaryColumn,
} from 'typeorm'

/**
 * A published instance of a versioned Spec event.
 */
@Entity('published_events', { schema: 'instances' })
@Index(['channel', 'timestamp'])
export class PublishedEvent {
    @PrimaryColumn('varchar', { length: 30 })
    id: string 

    @Column()
    @Index()
    channel: string

    @Column('json')
    data: object

    @Column()
    timestamp: number
}

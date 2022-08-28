import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

/**
 * A published instance of a versioned Spec event.
 */
@Entity('published_events', { schema: 'instances' })
@Index(['name', 'id'])
export class PublishedEvent {
    @PrimaryGeneratedColumn()
    id: number

    @Index()
    @Column('varchar', { length: 30, unique: true })
    uid: string

    @Column()
    @Index()
    name: string

    @Column('json')
    origin: object

    @Column('json')
    data: object

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'timestamp',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    timestamp: Date
}

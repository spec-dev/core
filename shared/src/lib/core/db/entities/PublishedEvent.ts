import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm'

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
    object: object

    @Column('int8')
    timestamp: number
}

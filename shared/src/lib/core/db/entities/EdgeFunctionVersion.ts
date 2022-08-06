import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm'
import { EdgeFunction } from './EdgeFunction'
import { LiveEdgeFunctionVersion } from './LiveEdgeFunctionVersion'

/**
 * A single version of an edge function.
 */
@Entity('edge_function_versions')
@Index(['nsp', 'name', 'version'], { unique: true })
export class EdgeFunctionVersion {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    nsp: string

    @Column()
    name: string

    @Column()
    version: string

    @Column()
    url: string

    @Column('json', { nullable: true })
    args: object

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @Column('int8', { name: 'edge_function_id' })
    edgeFunctionId: number

    @ManyToOne(() => EdgeFunction, (edgeFunction) => edgeFunction.edgeFunctionVersions)
    @JoinColumn({ name: 'edge_function_id' })
    edgeFunction: EdgeFunction

    @OneToMany(
        () => LiveEdgeFunctionVersion,
        (liveEdgeFunctionVersion) => liveEdgeFunctionVersion.edgeFunctionVersion
    )
    liveEdgeFunctionVersions: LiveEdgeFunctionVersion[]
}

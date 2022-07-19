import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, ManyToOne } from 'typeorm'
import { EdgeFunction } from './EdgeFunction'

/**
 * A single version of an edge function.
 */
@Entity('edge_function_versions')
@Index(['nsp', 'name', 'version'], { unique: true })
export class EdgeFunctionVersion {
    @PrimaryGeneratedColumn()
    id: number

    // Denormalized namespace name for quicker proxy lookups.
    @Column()
    nsp: string

    @Column()
    name: string

    @Column()
    version: string

    @Column()
    url: string

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @ManyToOne(() => EdgeFunction, (edgeFunction) => edgeFunction.edgeFunctionVersions)
    edgeFunction: EdgeFunction
}

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    Unique,
} from 'typeorm'
import { Namespace } from './Namespace'
import { EdgeFunctionVersion } from './EdgeFunctionVersion'

/**
 * Namespaced edge functions running on Deno.
 */
@Entity('edge_functions')
@Unique(['namespace', 'name'])
export class EdgeFunction {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index()
    name: string

    @Column()
    desc: string

    @CreateDateColumn({
        type: 'timestamp with time zone',
        name: 'created_at',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date

    @ManyToOne(() => Namespace, (nsp) => nsp.edgeFunctions)
    namespace: Namespace

    @OneToMany(() => EdgeFunctionVersion, (edgeFunctionVersion) => edgeFunctionVersion.edgeFunction)
    edgeFunctionVersions: EdgeFunctionVersion[]
}

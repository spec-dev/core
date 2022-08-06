import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm'
import { LiveObjectVersion } from './LiveObjectVersion'
import { EdgeFunctionVersion } from './EdgeFunctionVersion'

export enum LiveEdgeFunctionVersionRole {
    GetOne = 'getOne',
    GetMany = 'getMany',
}

/**
 * Join-table between LiveObjectVersion and EdgeFunctionVersion.
 */
@Entity('live_edge_function_versions')
@Index(['liveObjectVersionId', 'edgeFunctionVersionId'])
export class LiveEdgeFunctionVersion {
    @PrimaryGeneratedColumn()
    id: number

    @Column('varchar')
    role: LiveEdgeFunctionVersionRole

    @Column('json', { nullable: true })
    argsMap: object

    @Column('json', { nullable: true })
    metadata: object

    @Column('int8', { name: 'live_object_version_id' })
    liveObjectVersionId: number

    @ManyToOne(
        () => LiveObjectVersion,
        (liveObjectVersion) => liveObjectVersion.liveEdgeFunctionVersions
    )
    @JoinColumn({ name: 'live_object_version_id' })
    liveObjectVersion: LiveObjectVersion

    @Column('int8', { name: 'edge_function_version_id' })
    edgeFunctionVersionId: number

    @ManyToOne(
        () => EdgeFunctionVersion,
        (edgeFunctionVersion) => edgeFunctionVersion.liveEdgeFunctionVersions
    )
    @JoinColumn({ name: 'edge_function_version_id' })
    edgeFunctionVersion: EdgeFunctionVersion
}

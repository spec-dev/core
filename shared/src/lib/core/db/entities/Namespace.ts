import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, OneToMany } from 'typeorm'
import { Contract } from './Contract'
import { Event } from './Event'
import { LiveObject } from './LiveObject'
import { LiveCallHandler } from './LiveCallHandler'
import { NamespaceUser } from './NamespaceUser'
import { Project } from './Project'
import { StringKeyMap } from '../../../types'

/**
 * A globally unique namespace for projects, contracts, events, live objects, etc.
 */
@Entity('namespaces')
export class Namespace {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    name: string

    @Column()
    @Index({ unique: true })
    slug: string

    @Column({ name: 'code_url', nullable: true })
    codeUrl: string

    @Column({ name: 'has_icon', nullable: true })
    hasIcon: boolean

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @OneToMany(() => NamespaceUser, (namespaceUser) => namespaceUser.namespace)
    namespaceUsers: NamespaceUser[]

    @OneToMany(() => Project, (project) => project.namespace)
    projects: Project[]

    @OneToMany(() => Contract, (contract) => contract.namespace)
    contracts: Contract[]

    @OneToMany(() => Event, (event) => event.namespace)
    events: Event[]

    @OneToMany(() => LiveObject, (liveObject) => liveObject.namespace)
    liveObjects: LiveObject[]

    @OneToMany(() => LiveCallHandler, (liveCallHandler) => liveCallHandler.namespace)
    liveCallHandlers: LiveCallHandler[]

    publicView(): StringKeyMap {
        return {
            name: this.name,
        }
    }
}

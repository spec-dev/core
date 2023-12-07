import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    OneToMany,
    UpdateDateColumn,
} from 'typeorm'
import { Contract } from './Contract'
import { NamespaceAccessToken } from './NamespaceAccessToken'
import { Event } from './Event'
import { LiveObject } from './LiveObject'
import { LiveCallHandler } from './LiveCallHandler'
import { NamespaceUser } from './NamespaceUser'
import { Project } from './Project'
import { StringKeyMap } from '../../../types'
import { buildIconUrl } from '../../../utils/formatters'
import { getChainIdsForNamespace } from '../services/namespaceServices'
import { getCachedNamespaceRecordCounts } from '../../redis'

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

    @Column({ name: 'display_name', nullable: true })
    displayName: string

    @Column()
    @Index({ unique: true })
    slug: string

    @Column({ nullable: true })
    desc: string

    @Column({ name: 'short_desc', nullable: true })
    shortDesc: string

    @Column({ name: 'code_url', nullable: true })
    codeUrl: string

    @Column({ name: 'website_url', nullable: true })
    websiteUrl: string

    @Column({ name: 'twitter_url', nullable: true })
    twitterUrl: string

    @Column({ name: 'has_icon', nullable: true })
    hasIcon: boolean

    @Column({ nullable: true })
    verified: boolean

    @Column({ nullable: true })
    blurhash: string

    @Column({ nullable: true })
    searchable: boolean

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
        nullable: true,
    })
    updatedAt: Date

    @Column({
        type: 'timestamptz',
        name: 'joined_at',
        nullable: true,
    })
    joinedAt: Date

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

    @OneToMany(() => NamespaceAccessToken, (namespaceAccessToken) => namespaceAccessToken.namespace)
    namespaceAccessTokens: NamespaceAccessToken[]

    async publicView(): Promise<StringKeyMap> {
        const recordCountInfo = (await getCachedNamespaceRecordCounts([this.slug]))[this.slug] || {}
        let numRecords = parseInt(recordCountInfo.count)
        numRecords = Number.isNaN(numRecords) ? 0 : numRecords

        return {
            id: this.id,
            name: this.name,
            displayName: this.displayName,
            slug: this.slug,
            desc: this.desc,
            shortDesc: this.shortDesc,
            codeUrl: this.codeUrl,
            websiteUrl: this.websiteUrl,
            twitterUrl: this.twitterUrl,
            verified: this.verified || false,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
            joinedAt: this.joinedAt?.toISOString(),
            icon: this.hasIcon ? buildIconUrl(this.name) : null,
            blurhash: this.blurhash,
            chainIds: await getChainIdsForNamespace(this.name),
            records: numRecords,
            lastInteraction: recordCountInfo.updatedAt || null,
        }
    }
}

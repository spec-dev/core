import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
    OneToMany,
    DeleteDateColumn,
} from 'typeorm'
import { Project } from './Project'
import { OrgUser } from './OrgUser'
import { StringKeyMap } from '../../../types'

/**
 * A user-created organization.
 */
@Entity('orgs')
export class Org {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    uid: string

    @Column()
    name: string

    @Index({ unique: true })
    @Column()
    slug: string

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @DeleteDateColumn({
        type: 'timestamptz',
        name: 'deleted_at',
        nullable: true,
    })
    deletedAt: Date

    @OneToMany(() => OrgUser, (orgUser) => orgUser.org)
    orgUsers: OrgUser[]

    @OneToMany(() => Project, (project) => project.org)
    projects: Project[]

    publicView(): StringKeyMap {
        return {
            name: this.name,
            slug: this.slug,
        }
    }
}

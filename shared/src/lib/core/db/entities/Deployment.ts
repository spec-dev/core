import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm'
import { Project } from './Project'

export enum DeploymentStatus {
    Created = 'created',
    Uploaded = 'uploaded',
    Deployed = 'deployed',
}

/**
 * The deployment of a Project's config to its respective Spec instance.
 */
@Entity('deployments')
export class Deployment {
    @PrimaryGeneratedColumn()
    id: number

    @Index({ unique: true })
    @Column()
    version: string

    @Column('int8', { name: 'project_id' })
    projectId: number

    @Column('varchar', { default: DeploymentStatus.Created })
    status: DeploymentStatus

    @Column({ default: false })
    failed: boolean

    @CreateDateColumn({
        type: 'timestamptz',
        name: 'created_at',
        default: () => `CURRENT_TIMESTAMP at time zone 'UTC'`,
    })
    createdAt: Date

    @ManyToOne(() => Project, (project) => project.deployments)
    @JoinColumn({ name: 'project_id' })
    project: Project
}
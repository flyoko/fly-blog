import { z } from 'zod'

export const editableConfigKindSchema = z.enum([
	'categories',
	'navigation',
	'footer',
	'modules',
	'weather',
	'newsSources',
	'aboutTimeline',
	'aboutLinks',
])

export const configPullRequestSchema = z.object({
	kind: editableConfigKindSchema,
	content: z.unknown(),
	expectedHeadSha: z.string().min(1).optional(),
	title: z.string().min(1).max(160).optional(),
	body: z.string().max(10_000).optional(),
	idempotencyKey: z.string().min(8).max(128),
})

export type ConfigPullRequestRequest = z.infer<typeof configPullRequestSchema>

export const publishModeSchema = z.enum(['direct', 'pull_request'])
export const publishKindSchema = z.enum(['article', 'config'])
export const publishStatusSchema = z.enum([
	'created',
	'commit_created',
	'checks_pending',
	'preview_ready',
	'merged',
	'conflict',
	'failed',
])

export interface PullRequestFileDto {
	filename: string
	status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged'
	additions: number
	deletions: number
	changes: number
	patch: string | null
}

export interface PullRequestDto {
	number: number
	url: string
	title: string
	state: 'open' | 'closed'
	headSha: string
	headBranch: string
	baseBranch: string
	mergeable: boolean | null
	merged: boolean
}

export interface CheckSummaryDto {
	status: 'pending' | 'success' | 'failure'
	total: number
	successful: number
	failed: number
	pending: number
}

export interface DeploymentDto {
	id: string
	ref: string
	environment: string
	url: string
	status: 'pending' | 'success' | 'failure'
	updatedAt: string
}

export interface PublishRunDto {
	id: string
	kind: z.infer<typeof publishKindSchema>
	mode: z.infer<typeof publishModeSchema>
	status: z.infer<typeof publishStatusSchema>
	resourcePath?: string
	commitSha?: string
	branch?: string
	pullRequestNumber?: number
	pullRequestUrl?: string
	previewUrl?: string
	errorCode?: string
	errorMessage?: string
	createdAt: string
	updatedAt: string
}

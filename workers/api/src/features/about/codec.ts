import type { AboutProfile } from '../../../../../shared/admin/about'
import matter from 'gray-matter'
import { parse, stringify } from 'yaml'
import { aboutProfileSchema } from '../../../../../shared/admin/about'
import { ApiError } from '../../lib/api-error'

const yamlEngine = {
	parse: (value: string) => parse(value),
	stringify: (value: object) => stringify(value, { lineWidth: 0, sortMapEntries: true }).trimEnd(),
}

export function parseAboutProfile(input: { sha: string, content: string }): AboutProfile & { sha: string } {
	let parsed
	try {
		parsed = matter(input.content, { engines: { yaml: yamlEngine }, language: 'yaml' })
	}
	catch {
		throw new ApiError('VALIDATION_FAILED', 400, 'About profile frontmatter is not valid YAML')
	}
	const profile = aboutProfileSchema.safeParse({ ...parsed.data, body: parsed.content.replace(/^\r?\n/u, '') })
	if (!profile.success)
		throw new ApiError('VALIDATION_FAILED', 400, 'About profile is invalid', profile.error.flatten())
	return { ...profile.data, sha: input.sha }
}

export function serializeAboutProfile(profile: AboutProfile): string {
	const valid = aboutProfileSchema.parse(profile)
	const { body, ...frontmatter } = valid
	return `---\n${yamlEngine.stringify(frontmatter)}\n---\n${body}`
}

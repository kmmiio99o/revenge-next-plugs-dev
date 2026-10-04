import { find } from './revenge'

/**
 * Turns raw Discord message content into a flat list of styled runs that the
 * canvas can paint token by token.
 *
 * The renderer cannot interpret markdown, so every construct has to be
 * resolved here: mentions become literal handles, masked links collapse to
 * their label, and `**bold**` / `*italic*` / `__underline__` / `~~strike~~` /
 * `` `code` `` become run flags. Runs are never nested — the outermost marker
 * wins, which matches how a quote card reads in practice.
 */
export interface InlineRun {
	text: string
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	code?: boolean
}

function userStore(): any {
	return (
		find<any>(
			m =>
				typeof m?.getUser === 'function' && typeof m?.getUserIds === 'function',
		) ??
		find<any>(
			m =>
				typeof m?.getUser === 'function' &&
				typeof m?.getCurrentUser === 'function',
		)
	)
}

function channelStore(): any {
	return find<any>(
		m =>
			typeof m?.getChannel === 'function' &&
			typeof m?.getChannels === 'function',
	)
}

function resolveMention(match: string): string {
	const id = match.replace(/[<@!>&#]/g, '')
	if (!id) return match

	// Role and channel mentions are not user handles; resolve them where the
	// store is reachable and otherwise keep a readable placeholder.
	if (match.startsWith('<@&')) {
		const roles = find<any>(m => typeof m?.getRoles === 'function')
		const role = roles?.getRoles?.()?.find?.((r: any) => r?.id === id)
		return role?.name ? `@${role.name}` : '@role'
	}

	if (match.startsWith('<#')) {
		const channel = channelStore()?.getChannel?.(id)
		return channel?.name ? `#${channel.name}` : '#channel'
	}

	const user = userStore()?.getUser?.(id)
	if (user?.globalName) return `@${user.globalName}`
	if (user?.username) return `@${user.username}`
	return '@user'
}

/**
 * Normalises a message before it reaches the run parser.
 *
 * @param text raw `message.content`
 */
export function prepareText(text: unknown): string {
	let out = String(text ?? '')
	if (!out) return ''

	// Custom (and custom-animated) emoji have no glyph in the card.
	out = out.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, '')

	out = out.replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, resolveMention)

	// Masked links keep their label, drop the target.
	out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
	// Bare URLs are left alone — they are still readable in a quote.
	out = out.replace(/<((?:https?|mailto):[^>]+)>/g, '$1')

	// Spoilers lose their markup, not their content.
	out = out.replace(/\|\|([\s\S]+?)\|\|/g, '$1')

	// Block quotes and headers are chrome, not quote body.
	out = out.replace(/^>\s?/gm, '')
	out = out.replace(/^#{1,6}\s+/gm, '')

	out = out.replace(/\r\n?/g, '\n')
	out = out.replace(/[ \t]+/g, ' ')
	out = out.replace(/\n{3,}/g, '\n\n')

	return out.trim()
}

function endsRun(text: string, at: number, marker: string): number {
	// `**` immediately following a closing `*` belongs to the next marker.
	const index = text.indexOf(marker, at)
	if (index < 0) return -1
	if (marker === '*' && text[index + 1] === '*') return -1
	return index
}

/** Splits prepared text into flat, non-nested styled runs. */
export function parseRuns(text: string): InlineRun[] {
	const source = String(text ?? '')
	const runs: InlineRun[] = []
	let plain = ''
	let i = 0

	const flush = () => {
		if (plain) {
			runs.push({ text: plain })
			plain = ''
		}
	}
	const push = (run: InlineRun) => {
		if (run.text) runs.push(run)
	}

	while (i < source.length) {
		const ch = source[i]
		const next = source[i + 1]
		let end = -1

		if (ch === '*' && next === '*' && source[i + 2] === '*') {
			end = source.indexOf('***', i + 3)
			if (end > 0) {
				flush()
				push({ text: source.slice(i + 3, end), bold: true, italic: true })
				i = end + 3
				continue
			}
		}

		if (ch === '*' && next === '*') {
			end = source.indexOf('**', i + 2)
			if (end > 0) {
				flush()
				push({ text: source.slice(i + 2, end), bold: true })
				i = end + 2
				continue
			}
		}

		if (ch === '*' && next !== '*') {
			end = endsRun(source, i + 1, '*')
			if (end > i + 1) {
				flush()
				push({ text: source.slice(i + 1, end), italic: true })
				i = end + 1
				continue
			}
		}

		if (ch === '~' && next === '~') {
			end = source.indexOf('~~', i + 2)
			if (end > 0) {
				flush()
				push({ text: source.slice(i + 2, end), strike: true })
				i = end + 2
				continue
			}
		}

		if (ch === '_' && next === '_') {
			end = source.indexOf('__', i + 2)
			if (end > 0) {
				flush()
				push({ text: source.slice(i + 2, end), underline: true })
				i = end + 2
				continue
			}
		}

		if (ch === '_') {
			end = endsRun(source, i + 1, '_')
			if (end > i + 1 && source[i + 1] !== '_') {
				flush()
				push({ text: source.slice(i + 1, end), italic: true })
				i = end + 1
				continue
			}
		}

		if (ch === '`') {
			end = source.indexOf('`', i + 1)
			if (end > i) {
				flush()
				push({ text: source.slice(i + 1, end), code: true })
				i = end + 1
				continue
			}
		}

		plain += ch
		i++
	}

	flush()
	return runs
}

/** Convenience: raw content → prepared runs. */
export function runsFromMessage(text: unknown): InlineRun[] {
	return parseRuns(prepareText(text))
}

/** Applies the global `bold` style toggle across every run. */
export function forceBold(runs: InlineRun[]): InlineRun[] {
	return runs.map(run => (run.bold ? run : { ...run, bold: true }))
}

/** Strips everything but safe filename characters. */
export function safeFilename(input: string, max = 48): string {
	const cleaned = String(input ?? '')
		.replace(/[^\w.\- ]+/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max)
	return cleaned || 'quote'
}

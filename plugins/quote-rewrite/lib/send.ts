import { parseDataUrl, removeFromCache, writeToCache } from './files'
import { find, findByProps } from './revenge'

function getToken(): string {
	try {
		return findByProps<any>('getToken')?.getToken?.() ?? ''
	} catch {
		return ''
	}
}

function getApiBase(): string {
	try {
		let base = findByProps<any>('getAPIBaseURL', 'del')?.getAPIBaseURL?.()
		if (typeof base === 'string') {
			if (base.startsWith('//')) base = `https:${base}`
			// Only trust values that already carry the API path segment — a bare
			// origin would post the message to the wrong route.
			if (base.startsWith('http') && base.includes('/api/')) return base
		}
	} catch {}
	return 'https://discord.com/api/v9'
}

/**
 * Discord's internal attachment pipeline. Still present in some builds, so it
 * gets first refusal: it handles optimistic upload state properly.
 */
async function sendViaInternalPipeline(
	channelId: string,
	uri: string,
	filename: string,
	mime: string,
	width: number,
	height: number,
): Promise<boolean> {
	const uploadModule = find<any>(m => typeof m?.uploadLocalFiles === 'function')
	if (typeof uploadModule?.uploadLocalFiles !== 'function') return false

	await uploadModule.uploadLocalFiles({
		channelId,
		items: [
			{
				id: '0',
				item: {
					uri,
					originalUri: uri,
					mimeType: mime,
					filename,
					width,
					height,
					platform: 1,
				},
				isImage: true,
				isVideo: false,
				isClip: false,
				isThumbnail: false,
				origin: 1,
				mimeType: mime,
				filename,
			},
		],
		parsedMessage: {
			content: '',
			channel_id: channelId,
			tts: false,
			invalidEmojis: [],
			validNonShortcutEmojis: [],
		},
	})
	return true
}

/** Posts the message with the file attached through Discord's own REST API. */
async function sendViaRestApi(
	channelId: string,
	uri: string,
	filename: string,
	mime: string,
): Promise<void> {
	const token = getToken()
	if (!token) throw new Error('Unable to resolve authorization token.')

	const form = new FormData()
	form.append(
		'payload_json',
		JSON.stringify({
			content: '',
			channel_id: channelId,
			type: 0,
			sticker_ids: [],
			attachments: [{ id: '0', filename }],
			nonce: Date.now().toString(),
		}),
	)
	form.append('files[0]', { uri, type: mime, name: filename } as any)

	const controller =
		typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = controller
		? setTimeout(() => controller.abort(), 60_000)
		: undefined

	let response: Response
	try {
		response = await fetch(`${getApiBase()}/channels/${channelId}/messages`, {
			method: 'POST',
			headers: { Authorization: token },
			body: form,
			signal: controller?.signal,
		})
	} catch (error) {
		const aborted = (error as any)?.name === 'AbortError'
		throw aborted ? new Error('Upload timed out.') : error
	} finally {
		if (timer !== undefined) clearTimeout(timer)
	}

	if (!response.ok) {
		const text = await response.text().catch(() => '')
		console.warn('[Quote] REST upload failed:', response.status, text)
		throw new Error(`Discord API returned ${response.status}`)
	}
}

/**
 * Renders nothing — takes an already-rendered data URL, writes it to the app
 * cache and hands it to Discord. No third-party host is involved.
 */
export async function sendQuoteAttachment(
	channelId: string,
	dataUrl: string,
	filename: string,
): Promise<void> {
	if (!channelId) throw new Error('No channel to send the quote to.')

	const parts = parseDataUrl(dataUrl)
	if (!parts) throw new Error('Invalid rendered quote image.')

	const file = await writeToCache(dataUrl, filename)
	let sent = false
	try {
		try {
			sent = await sendViaInternalPipeline(
				channelId,
				file.uri,
				filename,
				parts.mime,
				1200,
				630,
			)
		} catch (error) {
			console.warn(
				'[Quote] Internal attachment pipeline failed, falling back to REST:',
				error,
			)
		}
		if (!sent) await sendViaRestApi(channelId, file.uri, filename, parts.mime)
	} finally {
		// The REST response resolves once the body has been consumed; the
		// internal pipeline reads the file on its own schedule.
		removeFromCacheAfter(file.path, sent ? 60_000 : 3_000)
	}
}

function removeFromCacheAfter(path: string, delay: number) {
	setTimeout(() => removeFromCache(path), delay)
}

/**
 * Posts plain text (a hosted quote URL) through the same channel pipeline the
 * app uses, falling back to a direct REST call.
 */
export function sendTextMessage(channelId: string, content: string): boolean {
	if (!channelId || !content) return false

	const nonce = (BigInt(Date.now() - 1420070400000) << 22n).toString()
	const payload = {
		content,
		tts: false,
		invalidEmojis: [],
		validNonShortcutEmojis: [],
	}

	try {
		const actions =
			findByProps<any>('sendMessage', 'editMessage') ??
			findByProps<any>('sendMessage')
		if (typeof actions?._sendMessage === 'function') {
			actions._sendMessage(channelId, payload, { nonce })
			return true
		}
		if (typeof actions?.sendMessage === 'function') {
			actions.sendMessage(channelId, payload, true, { nonce })
			return true
		}
	} catch (error) {
		console.warn('[Quote] sendMessage failed:', error)
	}

	try {
		const rest = findByProps<any>('get', 'post', 'del')
		if (typeof rest?.post === 'function') {
			rest.post({
				url: `/channels/${channelId}/messages`,
				body: { content, tts: false, nonce, flags: 0 },
			})
			return true
		}
	} catch (error) {
		console.warn('[Quote] REST message post failed:', error)
	}

	return false
}

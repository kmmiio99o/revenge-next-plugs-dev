import { parseDataUrl, writeToCache } from './files'
import { getRevenge } from './revenge'
import { getStoredSettings } from './settings'

export interface ZiplineCredentials {
	token: string
	host: string
}

/**
 * Resolves Zipline credentials for this plugin.
 *
 * The `enabled` switch in settings is the source of truth; the token itself
 * may come from the standalone Zipline plugin so a shared instance does not
 * need to be configured twice.
 */
export function resolveZiplineCredentials(): ZiplineCredentials | null {
	let configured: ZiplineCredentials | null = null
	try {
		const settings = getStoredSettings()
		if (!settings.zipline.enabled) return null
		configured = {
			token: settings.zipline.token.trim(),
			host: settings.zipline.host || 'i.allyapp.cc',
		}
	} catch {
		return null
	}

	if (configured.token) return configured

	try {
		const rev = getRevenge()
		const storage = rev?.jsonStorage?.getJsonStorage?.(
			'dev.everestmcarthur.zipline',
		)
		const cached = storage?.cache
		if (cached?.token?.trim()) {
			return {
				token: cached.token.trim(),
				host: configured.host || cached.host || 'i.allyapp.cc',
			}
		}
	} catch {}

	return null
}

export function isZiplineConfigured(): boolean {
	return resolveZiplineCredentials() !== null
}

function normalizeHost(raw: string): string {
	return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

/**
 * Uploads a locally rendered card to Zipline and returns its public URL.
 *
 * The file is written to the cache first because React Native's `FormData`
 * only accepts `file://`/`content://` URIs as file parts.
 */
export async function uploadDataUrlToZipline(
	dataUrl: string,
	filename: string,
): Promise<string | null> {
	const credentials = resolveZiplineCredentials()
	if (!credentials) return null

	const parts = parseDataUrl(dataUrl)
	if (!parts) return null

	let uri: string | null = null
	let path = ''
	try {
		const file = await writeToCache(dataUrl, filename)
		uri = file.uri
		path = file.path

		const form = new FormData()
		form.append('file', {
			uri,
			name: filename,
			type: parts.mime,
		} as any)

		const response = await fetch(
			`https://${normalizeHost(credentials.host)}/api/upload`,
			{
				method: 'POST',
				headers: { authorization: credentials.token },
				body: form,
			},
		)

		if (!response.ok) {
			console.warn('[Quote] Zipline upload status:', response.status)
			return null
		}

		const json = await response.json().catch(() => null)
		const fileUrl = json?.files?.[0]?.url || json?.files?.[0]
		return typeof fileUrl === 'string' ? fileUrl : null
	} catch (error) {
		console.warn('[Quote] Zipline upload failed:', error)
		return null
	} finally {
		if (path) {
			setTimeout(() => {
				try {
					getRevenge()?.discord?.native?.FileModule?.removeFile?.(
						'cache',
						path.replace(/^file:\/\//, ''),
					)
				} catch {}
			}, 3_000)
		}
	}
}

import { getRevenge } from './revenge'

export interface DataUrlParts {
	body: string
	isBase64: boolean
	mime: string
}

export function parseDataUrl(dataUrl: unknown): DataUrlParts | null {
	const value = String(dataUrl ?? '')
	if (!value.startsWith('data:')) return null

	const comma = value.indexOf(',')
	if (comma < 0) return null

	const meta = value.slice(5, comma)
	const body = value.slice(comma + 1)
	if (!body) return null

	return {
		body,
		isBase64: meta.includes(';base64'),
		mime: (meta.split(';')[0] || 'image/png').trim() || 'image/png',
	}
}

export function getFileModule(): any {
	try {
		const module = getRevenge()?.discord?.native?.FileModule
		if (module && typeof module.writeFile === 'function') return module
	} catch {}
	return null
}

export interface WrittenFile {
	/** Full absolute path returned by the native module. */
	path: string
	/** `file://` URI usable in `FormData` parts and `Image` sources. */
	uri: string
}

/**
 * Writes a rendered card into the app cache.
 *
 * Returns a `file://` URI because that is the only scheme React Native's
 * multipart uploads understand, but keeps the raw path so callers can clean
 * up through `removeFile` (which takes a path, not a URI).
 */
export async function writeToCache(
	dataUrl: string,
	filename: string,
): Promise<WrittenFile> {
	const parts = parseDataUrl(dataUrl)
	if (!parts) throw new Error('Invalid rendered image.')
	if (!parts.isBase64) throw new Error('Renderer returned an unencoded image.')

	const module = getFileModule()
	if (!module) throw new Error('Native file module unavailable.')

	const path = await module.writeFile(
		'cache',
		`quote-rewrite/${Date.now()}-${Math.random().toString(16).slice(2)}-${filename}`,
		parts.body,
		'base64',
	)

	const raw = String(path ?? '')
	return {
		path: raw,
		uri: raw.startsWith('file://') ? raw : `file://${raw}`,
	}
}

export function removeFromCache(path: string): void {
	try {
		const raw = String(path || '').replace(/^file:\/\//, '')
		if (!raw) return
		const promise = getFileModule()?.removeFile?.('cache', raw)
		;(promise as any)?.catch?.(() => {})
	} catch {}
}

export async function saveToGallery(
	path: string,
	filename: string,
	mime: string,
): Promise<string | null> {
	const module = getFileModule()
	const save = module?.saveFileToGallery
	if (typeof save !== 'function') return null
	// The native signature only accepts PNG/JPEG, so a GIF has to leave the
	// plugin through Discord instead.
	if (!mime.includes('png')) return null

	const raw = String(path || '')
	const uri = raw.startsWith('file://') ? raw : `file://${raw}`
	try {
		return (await save.call(module, uri, filename, 'PNG')) ?? null
	} catch {
		return null
	}
}

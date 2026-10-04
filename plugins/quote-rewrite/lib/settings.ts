import type { StoredSettings } from './types'

export type { QuoteStyle, StoredSettings, ZiplineConfig } from './types'

export const defaultSettings: StoredSettings = {
	instantQuote: true,
	zipline: {
		enabled: false,
		host: 'i.allyapp.cc',
		token: '',
	},
	defaultSettings: {
		light: false,
		color: false,
		bold: false,
		flip: false,
		new: false,
		gif: false,
		watermark: false,
		watermarkText: 'Make It A Quote',
		theme: 'midnight',
		font: 'rounded',
	},
}

let activeJsonStorage: any = null

export function setJsonStorageInstance(instance: any) {
	activeJsonStorage = instance
}

export function getStorage(): any {
	if (activeJsonStorage) return activeJsonStorage

	const rev = (globalThis as any).revenge
	if (
		rev?.jsonStorage?.getJsonStorage &&
		rev?.jsonStorage?.pluginStoragePathFor
	) {
		const path = rev.jsonStorage.pluginStoragePathFor(
			'dev.everestmcarthur.quote',
			'settings.json',
		)
		activeJsonStorage = rev.jsonStorage.getJsonStorage(path, {
			default: defaultSettings,
			load: true,
		})
		return activeJsonStorage
	}

	// Settings become an in-memory object so the plugin still behaves while
	// jsonStorage has not finished booting.
	const fallback = { ...defaultSettings }
	return {
		cache: fallback,
		use: () => fallback,
		get: async () => fallback,
		set: async (value: any) => Object.assign(fallback, value),
	}
}

function snapshot(instance: any): StoredSettings {
	const cached = instance?.cache ?? {}
	return {
		...defaultSettings,
		...cached,
		defaultSettings: {
			...defaultSettings.defaultSettings,
			...(cached.defaultSettings ?? {}),
		},
		zipline: {
			...defaultSettings.zipline,
			...(cached.zipline ?? {}),
		},
	}
}

export function getStoredSettings(): StoredSettings {
	try {
		return snapshot(getStorage())
	} catch {
		return defaultSettings
	}
}

/**
 * Merges a patch into the stored object and persists it. Nested keys are
 * merged one level deep so callers can update a single style toggle without
 * reserialising the rest of the settings from a possibly stale snapshot.
 */
export function updateStoredSettings(
	patch: Partial<StoredSettings>,
): StoredSettings {
	const current = getStoredSettings()
	const next: StoredSettings = {
		...current,
		...patch,
		defaultSettings: {
			...current.defaultSettings,
			...(patch.defaultSettings ?? {}),
		},
		zipline: {
			...current.zipline,
			...(patch.zipline ?? {}),
		},
	}

	try {
		const instance = getStorage()
		instance?.set?.(next)
		if (instance?.cache && typeof instance.cache === 'object') {
			Object.assign(instance.cache, next)
		}
	} catch {}

	return next
}

/**
 * React-friendly read of the current settings for components that already
 * hold a `jsonStorage` instance through the plugin API.
 */
export const storage = new Proxy({} as any, {
	get(_target, prop) {
		const instance = getStorage()
		if (prop === 'cache') return getStoredSettings()
		const value = instance?.[prop]
		return typeof value === 'function' ? value.bind(instance) : value
	},
	set(_target, prop, value) {
		getStorage()[prop] = value
		return true
	},
})

/**
 * Thin wrappers around the `revenge` runtime globals.
 *
 * Everything in this plugin is resolved lazily and defensively: a finder that
 * misses must never throw, because each of these helpers runs from UI code
 * that has no error boundary around it.
 */

function getRevenge(): any {
	try {
		if (typeof revenge !== 'undefined') return revenge
	} catch {}
	return (globalThis as any).revenge
}

export { getRevenge }

/**
 * The finder object lives at a different address depending on the Revenge
 * build, so every known location is tried before giving up.
 */
export function finders(): any {
	const rev = getRevenge()
	return (
		rev?.modules?.finders ??
		rev?.discord?.utils?.modules?.finders ??
		rev?.discord?.utils?.finders ??
		rev?.everest
	)
}

/** Unwraps the `[exports, id]` tuples finders hand back. */
function unwrapExports(value: any): any {
	return Array.isArray(value) ? value[0] : value
}

/**
 * Matches modules by export key. Accepts both revenge's `withProps` filters
 * and plain predicate functions, so callers can do either.
 */
export function findByProps<T = any>(...props: string[]): T | undefined {
	try {
		const f = finders()
		if (!f?.lookupModule || !f?.filters?.withProps) return undefined
		const res = f.lookupModule(f.filters.withProps(...props))
		if (!res) return undefined
		return (Array.isArray(res) ? res[0] : res) as T
	} catch {
		return undefined
	}
}

/** `Array.find` over every initialized Metro module. */
export function find<T = any>(
	predicate: (module: any) => boolean,
): T | undefined {
	try {
		const f = finders()
		if (!f?.lookupModule) return undefined
		const res = f.lookupModule(predicate)
		if (!res) return undefined
		return (Array.isArray(res) ? res[0] : res) as T
	} catch {
		return undefined
	}
}

export function findByImportedPath<T = any>(path: string): T | undefined {
	try {
		const f = finders()
		if (typeof f?.lookupModuleWithImportedPath !== 'function') return undefined
		const res = f.lookupModuleWithImportedPath(path)
		return res ? (unwrapExports(res) as T) : undefined
	} catch {
		return undefined
	}
}

export function findAssetId(name: string): any {
	try {
		return getRevenge()?.assets?.getAssetIdByName?.(name)
	} catch {
		return undefined
	}
}

/**
 * Resolves a Discord icon component by name.
 *
 * `withGeneratedIconComponent` builds a filter keyed on the icon's own module,
 * which is the only name-independent way to find glyphs Discord never renders
 * on the current screen. Misses are *not* cached so a late-loading icon module
 * still resolves on the next call.
 */
const iconCache = new Map<string, any>()

export function getIcon(name: string): any {
	if (iconCache.has(name)) return iconCache.get(name)

	let icon: any = null
	try {
		const rev = getRevenge()
		const generated = rev?.utils?.discord?.withGeneratedIconComponent
		const filters = rev?.modules?.finders?.filters
		const lookup = rev?.modules?.finders?.lookupModule
		if (!filters || !lookup) return null

		const filter =
			(typeof generated === 'function' && generated(name)) ||
			filters.withProps(name)

		for (const match of lookup(filter) ?? []) {
			const candidate = match?.[name] ?? match?.default?.[name]
			if (candidate) {
				icon = candidate
				break
			}
		}
	} catch {
		icon = null
	}

	if (icon) iconCache.set(name, icon)
	return icon
}

/**
 * Toasts through whichever channel this build exposes. Ordered from the most
 * specific Revenge API down to a plain Android toast so there is always a
 * visible signal when something fails.
 */
export function showToast(content: string, assetId?: any): void {
	const message = String(content ?? '')
	try {
		const rev = getRevenge()
		const ui = rev?.ui?.toasts
		if (typeof ui?.showToast === 'function') {
			ui.showToast(message, assetId)
			return
		}
		if (typeof rev?.toasts?.show === 'function') {
			try {
				rev.toasts.show({ title: message })
				return
			} catch {
				rev.toasts.show(message)
				return
			}
		}
	} catch {}

	try {
		const toastModule = findByProps('showToast')
		if (typeof toastModule?.showToast === 'function') {
			toastModule.showToast(message, assetId)
			return
		}
	} catch {}

	try {
		const RN = getRevenge()?.react?.ReactNative
		if (typeof RN?.ToastAndroid?.show === 'function') {
			RN.ToastAndroid.show(message, RN.ToastAndroid.SHORT)
			return
		}
	} catch {}
}

export function getCurrentUserId(): string {
	try {
		const rev = getRevenge()
		const userStore = rev?.everest?.getUserStore?.()
		const fromStore = userStore?.getCurrentUser?.()?.id
		if (fromStore) return fromStore

		const userModule = findByProps('getCurrentUser')
		return userModule?.getCurrentUser?.()?.id ?? ''
	} catch {
		return ''
	}
}

export function getSelectedChannelId(): string {
	try {
		const rev = getRevenge()
		const selected = rev?.everest?.getSelectedChannelStore?.()
		return (
			selected?.getLastSelectedChannelId?.() ||
			selected?.getChannelId?.() ||
			findByProps('getLastSelectedChannelId')?.getLastSelectedChannelId?.() ||
			findByProps('getChannelId')?.getChannelId?.() ||
			''
		)
	} catch {
		return ''
	}
}

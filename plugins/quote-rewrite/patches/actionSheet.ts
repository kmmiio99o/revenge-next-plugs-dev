import React from 'react'
import { extractQuoteSource, isQuotableMessage } from '../lib/messages'
import {
	findByImportedPath,
	findByProps,
	getIcon,
	getRevenge,
} from '../lib/revenge'
import { getStoredSettings } from '../lib/settings'
import { hideActionSheet, openLazyActionSheet } from '../ui/components'
import QuoteSheet, { ACTION_SHEET_KEY } from '../ui/QuoteSheet'

const MESSAGE_SHEET_KEY = 'MessageLongPressActionSheet'
const SHEET_PATH =
	'modules/messages/native/long_press/LongPressMessageActionSheet.tsx'
const SHOW_SHEET_PATH =
	'modules/messages/native/long_press/showLongPressMessageActionSheet.tsx'
const ROW_PATH = 'design/components/Sheet/native/ActionSheetRow.native.tsx'
const ACTIONS_PATH = 'modules/action_sheet/native/ActionSheetActionCreators.tsx'
const ROW_LABEL = 'Make it a Quote'

const warned = new Set<string>()

function warnOnce(key: string, message: string, detail?: unknown) {
	if (warned.has(key)) return
	warned.add(key)
	console.warn(`[Quote] ${message}`, detail ?? '')
}

interface State {
	message: any
	channel: any
	/** The `openLazy` key of the sheet currently on screen. */
	sheetKey: string | null
}

function capture(state: State, props: any) {
	const location = props?.analyticsLocation ?? props
	const message = location?.message
	if (message && isQuotableMessage(message)) {
		state.message = message
		state.channel = location?.channel ?? null
		return true
	}
	return false
}

function canInject(state: State): boolean {
	return Boolean(state.message) && state.sheetKey === MESSAGE_SHEET_KEY
}

/* ------------------------------------------------------------------ rows */

function rowIconComponent(row: any): any {
	try {
		return row?.props?.icon?.props?.IconComponent
	} catch {
		return undefined
	}
}

/**
 * Where the row goes. "Create Thread" is matched first on the English label,
 * then on the `ThreadIcon` component Discord itself builds it with, so a
 * localised client still lands in the right place. Copy Text is the last
 * anchor; failing everything, the row sits just above the danger rows.
 */
function findAnchorIndex(rows: any[]): number {
	for (let i = 0; i < rows.length; i++) {
		const label = rows[i]?.props?.label
		if (typeof label === 'string' && /create\s+thread/i.test(label))
			return i + 1
	}

	const threadIcon = getIcon('ThreadIcon')
	if (threadIcon) {
		for (let i = 0; i < rows.length; i++) {
			if (rowIconComponent(rows[i]) === threadIcon) return i + 1
		}
	}

	const copyIcon = getIcon('CopyIcon')
	if (copyIcon) {
		for (let i = 0; i < rows.length; i++) {
			if (rowIconComponent(rows[i]) === copyIcon) return i + 1
		}
	}

	const dangerIndex = rows.findIndex(r => r?.props?.variant === 'danger')
	return dangerIndex === -1 ? rows.length : dangerIndex
}

function buildRow(state: State, template: any, channelId: string): any {
	const Row = template?.type
	if (!Row) return null

	const message = state.message
	const onPress = () => openQuoteSheet(message, channelId)

	const Icon = Row.Icon
	const icon = Icon
		? React.createElement(Icon, {
				IconComponent: getIcon('QuoteIcon') ?? getIcon('CopyIcon'),
			})
		: null

	return React.createElement(Row, {
		key: 'make-it-a-quote',
		label: ROW_LABEL,
		icon,
		onPress,
	})
}

/** Returns a fresh array with the row inserted, or `null` when nothing changed. */
function injectRows(state: State, rows: any[]): any[] | null {
	if (!Array.isArray(rows) || rows.length === 0) return null
	if (!canInject(state)) return null
	if (rows.some(row => row?.props?.label === ROW_LABEL)) return null
	if (!rows[0]?.type) return null

	const channelId =
		state.channel?.id ||
		state.message?.channel_id ||
		state.message?.channelId ||
		''
	const row = buildRow(state, rows[0], channelId)
	if (!row) return null

	const index = findAnchorIndex(rows)
	const next = rows.slice()
	next.splice(index, 0, row)
	return next
}

/* -------------------------------------------------------- element tree */

function isRowArray(rows: any): boolean {
	if (!Array.isArray(rows) || rows.length === 0) return false
	const first = rows[0]
	return (
		first?.type?.name === 'ActionSheetRow' ||
		(first?.props && typeof first.props.label === 'string')
	)
}

function walkRows(tree: any, out: any[][] = []): any[][] {
	if (!tree || typeof tree !== 'object') return out

	if (Array.isArray(tree)) {
		if (isRowArray(tree) && !out.includes(tree)) out.push(tree)
		for (const child of tree) walkRows(child, out)
		return out
	}

	const children = tree?.props?.children
	if (Array.isArray(children)) {
		if (isRowArray(children) && !out.includes(children)) out.push(children)
		for (const child of children) walkRows(child, out)
	} else {
		walkRows(children, out)
	}
	return out
}

/** Second injection point: mutates the rows inside the component's own tree. */
function injectTree(state: State, tree: any): any {
	if (!tree || !canInject(state)) return tree
	for (const rows of walkRows(tree)) {
		if (!canInject(state)) break
		if (rows.some(row => row?.props?.label === ROW_LABEL)) continue
		if (!rows[0]?.type) continue

		const channelId =
			state.channel?.id ||
			state.message?.channel_id ||
			state.message?.channelId ||
			''
		const row = buildRow(state, rows[0], channelId)
		if (!row) continue

		rows.splice(findAnchorIndex(rows), 0, row)
	}
	return tree
}

/* ---------------------------------------------------------------- sheet */

function openQuoteSheet(message: any, channelId: string) {
	const source = extractQuoteSource(message, channelId)
	const autoSend = getStoredSettings().instantQuote !== false

	// Injected rows bypass Discord's own handler, so dismiss the menu first.
	hideActionSheet(MESSAGE_SHEET_KEY)
	hideActionSheet(ACTION_SHEET_KEY)
	setTimeout(() => {
		openLazyActionSheet(
			() => React.createElement(QuoteSheet, { source, autoSend }),
			ACTION_SHEET_KEY,
			{},
		)
	}, 150)
}

/* --------------------------------------------------------------- hooks */

function everyFinder(): any[] {
	const rev = getRevenge()
	return [
		rev?.modules?.finders,
		rev?.discord?.utils?.modules?.finders,
		rev?.discord?.utils?.finders,
		rev?.everest,
	].filter(Boolean)
}

/** Runs `callback` once `path` has been initialised by Metro. */
function onImportedPath(
	path: string,
	callback: (exports: any) => void,
): () => void {
	const unwrap = (value: any) => (Array.isArray(value) ? value[0] : value)
	const unsubscribes: Array<() => void> = []

	for (const api of everyFinder()) {
		const lookup = api.lookupModuleWithImportedPath
		if (typeof lookup === 'function') {
			try {
				const existing = lookup(path)
				if (existing) {
					callback(unwrap(existing))
					return () => {}
				}
			} catch {}
		}
	}

	for (const api of everyFinder()) {
		const wait =
			api.waitForModuleWithImportedPath ?? api.getModuleWithImportedPath
		if (typeof wait !== 'function') continue
		try {
			const unsubscribe = wait(path, (value: any) => callback(unwrap(value)))
			if (typeof unsubscribe === 'function') unsubscribes.push(unsubscribe)
		} catch {}
	}

	if (unsubscribes.length === 0) {
		warnOnce(
			'finders',
			'No finder exposes lookupModuleWithImportedPath — sheet injection disabled.',
		)
	} else if (unsubscribes.length > 0) {
		return () => {
			for (const un of unsubscribes) {
				try {
					un()
				} catch {}
			}
		}
	}

	return () => {}
}

/** Every object that exposes `openLazy` — more than one may be wired up. */
function actionSheetCandidates(): any[] {
	const found: any[] = []
	const add = (value: any) => {
		if (value && typeof value === 'object' && !found.includes(value)) {
			found.push(value)
		}
	}

	try {
		add(getRevenge()?.discord?.actions?.ActionSheetActionCreators)
	} catch {}
	try {
		add(findByImportedPath(ACTIONS_PATH)?.default)
	} catch {}
	try {
		add(findByProps('openLazy', 'hideActionSheet'))
	} catch {}

	return found
}

/** Every object that owns an `ActionSheetRow` we can safely patch. */
function rowNamespaces(): any[] {
	const found: any[] = []
	const add = (value: any) => {
		if (value && typeof value === 'object' && !found.includes(value)) {
			found.push(value)
		}
	}

	try {
		add(getRevenge()?.discord?.design?.Design?.ActionSheetRow)
	} catch {}
	try {
		add(findByProps('ActionSheetRow')?.ActionSheetRow)
	} catch {}
	try {
		add(findByImportedPath(ROW_PATH)?.ActionSheetRow)
	} catch {}

	return found
}

/**
 * Adds "Make it a Quote" to the message long-press sheet, directly beneath
 * "Create Thread".
 *
 * The row is injected through `ActionSheetRow.Group`'s props, which every
 * sheet goes through regardless of which module happens to render it, and
 * additionally through the sheet component's own return value when its
 * recorded path resolves. The message itself is captured from `openLazy`,
 * whose third argument always carries `{ message, channel }`.
 */
export function patchMessageActionSheet(): () => void {
	const patches: Array<() => void> = []
	const rev = getRevenge()
	const patcher = rev?.patcher
	if (!patcher?.before || !patcher?.after) {
		warnOnce('patcher', 'Patcher unavailable, sheet row disabled.')
		return () => {}
	}

	const state: State = { message: null, channel: null, sheetKey: null }

	/* 1. Track which sheet is on screen and grab the message it was opened for. */
	for (const actions of actionSheetCandidates()) {
		if (typeof actions?.openLazy !== 'function') continue
		try {
			patches.push(
				patcher.before(actions, 'openLazy', (args: any[]) => {
					const key = String(args?.[1] ?? '')
					state.sheetKey = key || null
					if (key === MESSAGE_SHEET_KEY) capture(state, args?.[2])
					return args
				}),
			)
		} catch (error) {
			warnOnce('openLazy', 'Failed to hook openLazy:', error)
		}
	}
	if (!actionSheetCandidates().some(a => typeof a?.openLazy === 'function')) {
		warnOnce('actions', 'ActionSheetActionCreators.openLazy not found.')
	}

	/* 2. Backup capture from the function that opens the sheet. */
	patches.push(
		onImportedPath(SHOW_SHEET_PATH, exports => {
			if (typeof exports?.showLongPressMessageActionSheet !== 'function') return
			try {
				patches.push(
					patcher.before(
						exports,
						'showLongPressMessageActionSheet',
						(args: any[]) => {
							state.sheetKey = MESSAGE_SHEET_KEY
							capture(state, args?.[0])
							return args
						},
					),
				)
			} catch (error) {
				warnOnce('show-sheet', 'Failed to hook showLongPress…:', error)
			}
		}),
	)

	/* 3. Primary injection point: Group props, independent of module paths. */
	for (const namespace of rowNamespaces()) {
		if (typeof namespace.Group !== 'function') continue
		try {
			patches.push(
				patcher.before(namespace, 'Group', (args: any[]) => {
					const props = args?.[0]
					if (!Array.isArray(props?.children)) return args
					const children = injectRows(state, props.children)
					if (!children) return args
					return [{ ...props, children }]
				}),
			)
		} catch (error) {
			warnOnce('group', 'Failed to patch ActionSheetRow.Group:', error)
		}
	}
	if (!rowNamespaces().some(n => typeof n.Group === 'function')) {
		warnOnce('group-missing', 'ActionSheetRow.Group could not be resolved.')
	}

	/* 4. Secondary injection point: the sheet component's own element tree. */
	patches.push(
		onImportedPath(SHEET_PATH, exports => {
			if (typeof exports?.default !== 'function') return

			const safe = (res: any, props: any) => {
				if (props) capture(state, props)
				try {
					return injectTree(state, res)
				} catch (error) {
					warnOnce('inject', 'Row injection failed:', error)
					return res
				}
			}

			try {
				patches.push(
					patcher.after(exports, 'default', (res: any, ...args: any[]) =>
						safe(res, args?.[0]),
					),
				)
				return
			} catch (error) {
				warnOnce('sheet-after', 'Patcher rejected the sheet export:', error)
			}

			const original = exports.default
			const wrapped = (props: any) => safe(original(props), props)
			try {
				exports.default = wrapped
				patches.push(() => {
					if (exports.default === wrapped) exports.default = original
				})
			} catch {
				warnOnce('sheet-assign', 'Could not wrap the sheet export.')
			}
		}),
	)

	return () => {
		for (const unpatch of patches.splice(0)) {
			try {
				unpatch()
			} catch {}
		}
	}
}

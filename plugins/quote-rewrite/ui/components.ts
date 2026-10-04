import React from 'react'
import { findByProps, getRevenge } from '../lib/revenge'

/**
 * Lazy wrappers around Discord's own sheet components.
 *
 * Each export resolves its real module on first render rather than at import
 * time, so a component that has not been Metro-initialised yet still paints
 * the first frame instead of throwing.
 */
function designComponent(prop: string, subProp?: string): any {
	const resolve = (): any => {
		try {
			const rev = getRevenge()
			const design = rev?.discord?.design?.Design
			if (design?.[prop]) {
				return subProp ? design[prop][subProp] : design[prop]
			}
			// Navigation shells live outside the design namespace.
			if (rev?.components?.[prop]) return rev.components[prop]
		} catch {}
		return findByProps(prop)?.[prop]
	}

	const Lazy: any = React.forwardRef((props: any, ref: any) => {
		const Real = resolve()
		if (!Real) return null

		// Discord's design TextInput reports through whichever handler it was
		// handed, so normalise both shapes down to a plain string.
		if (prop === 'TextInput') {
			const { onChange, onChangeText, value, ...rest } = props
			const handleChange = (next: any) => {
				const text =
					typeof next === 'string'
						? next
						: (next?.nativeEvent?.text ?? next?.text ?? '')
				onChange?.(text)
				onChangeText?.(text)
			}
			return React.createElement(Real, {
				...rest,
				ref,
				value: value ?? '',
				onChange: handleChange,
				onChangeText: handleChange,
			})
		}

		return React.createElement(Real, { ...props, ref })
	})
	Lazy.displayName = `Quote${prop}${subProp ? `_${subProp}` : ''}`
	return Lazy
}

export const ActionSheet: any = designComponent('ActionSheet')
export const Page: any = designComponent('Page')
export const FormSection: any = designComponent('FormSection')
export const BottomSheetTitleHeader: any = designComponent(
	'BottomSheetTitleHeader',
)
export const ActionSheetCloseButton: any = designComponent(
	'ActionSheetCloseButton',
)
export const TableRowGroup: any = designComponent('TableRowGroup')
export const TableSwitchRow: any = designComponent('TableSwitchRow')
export const TableRadioGroup: any = designComponent('TableRadioGroup')
export const TableRadioRow: any = designComponent('TableRadioRow')
export const TableRow: any = designComponent('TableRow')
export const TextInput: any = designComponent('TextInput')
export const Button: any = designComponent('Button')

export function getActionSheetActionCreators(): any {
	const rev = getRevenge()
	return (
		rev?.discord?.actions?.ActionSheetActionCreators ??
		findByProps('openLazy', 'hideActionSheet') ??
		findByProps('showActionSheet')
	)
}

export function openLazyActionSheet(
	render: () => any,
	key: string,
	props: Record<string, any> = {},
): void {
	const actions = getActionSheetActionCreators()
	if (typeof actions?.openLazy === 'function') {
		actions.openLazy(Promise.resolve({ default: render }), key, props)
	}
}

export function hideActionSheet(key?: string): void {
	try {
		getActionSheetActionCreators()?.hideActionSheet?.(key)
	} catch {
		try {
			getActionSheetActionCreators()?.hideActionSheet?.()
		} catch {}
	}
}

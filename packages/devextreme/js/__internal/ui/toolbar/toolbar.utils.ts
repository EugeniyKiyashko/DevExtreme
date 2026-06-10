import type { dxElementWrapper } from '@js/core/renderer';
import $ from '@js/core/renderer';
import type { DxEvent } from '@js/events';
import type { Item } from '@js/ui/toolbar';
import { getPublicElement } from '@ts/core/m_element';
import { getComponentInstance } from '@ts/core/utils/m_public_component';
import type Widget from '@ts/core/widget/widget';
import { DISABLED_STATE_CLASS, type SupportedKeys, WIDGET_CLASS } from '@ts/core/widget/widget';
import eventsEngine from '@ts/events/core/m_events_engine';
import type { KeyboardKeyDownEvent } from '@ts/events/core/m_keyboard_processor';
import { BUTTON_GROUP_CLASS } from '@ts/ui/button_group';
import type { ListBase } from '@ts/ui/list/list.base';
import { OVERLAY_CONTENT_CLASS } from '@ts/ui/overlay/overlay';
import {
  DROPDOWNMENU_BUTTON_CLASS,
  MENU_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_EXPANDED_CLASS,
  NATIVE_FOCUSABLE_SELECTOR,
  TEXTEDITOR_CLASS,
  TEXTEDITOR_INPUT_CLASS,
  TOOLBAR_ITEMS,
  TOOLBAR_WIDGETS_SELECTOR,
} from '@ts/ui/toolbar/constants';
import type Toolbar from '@ts/ui/toolbar/toolbar';

function getItemElementData($element: dxElementWrapper): Record<string, unknown> {
  // @ts-expect-error
  const data = $element.data() as unknown;
  return (data ?? {}) as Record<string, unknown>;
}

const getWidgetName = ($element: dxElementWrapper): string => {
  const dxComponents = getItemElementData($element).dxComponents as string[] | undefined;
  return dxComponents?.[0] ?? '';
};

function getItemWidget($item: dxElementWrapper): Widget | undefined {
  const $widget = $item.find(TOOLBAR_WIDGETS_SELECTOR).first();
  return $widget.length ? getComponentInstance<Widget>($widget) : undefined;
}

// Single home for the `opened` typing gap: WidgetProperties does not declare `opened` (it is
// contributed by descendants such as dxDropDownButton/dxMenu), and core's
// Widget.option(...args): TProperties also does not narrow on single-key reads.
function getChildWidgetOpened(instance: Widget | undefined): boolean {
  // @ts-expect-error – see note above.
  return !!instance?.option().opened;
}

export function isTextInputTarget(target: HTMLElement): boolean {
  const tagName = target.tagName.toLowerCase();

  return (tagName === 'input' || tagName === 'textarea')
    && $(target).closest(`.${TEXTEDITOR_CLASS}`).length > 0;
}

export function isMenuTarget(target: HTMLElement): boolean {
  return $(target).closest(`.${MENU_CLASS}, .${MENU_ITEM_CLASS}`).length > 0;
}

export function activateMenu($menu: dxElementWrapper): void {
  ($menu.get(0) as HTMLElement).focus();
}

export function closeOpenSubmenu(target: HTMLElement, e: Event): boolean {
  const $menu = $(target).closest(`.${MENU_CLASS}`);
  if (!$menu.length) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuInstance = $menu.data('dxMenu') as any;
  if (!menuInstance?._visibleSubmenu) {
    return false;
  }

  e.preventDefault();
  e.stopPropagation();

  const $anchor = $menu.find(`.${MENU_ITEM_EXPANDED_CLASS}`).first();
  menuInstance._hideSubmenu(menuInstance._visibleSubmenu);

  if ($anchor.length) {
    menuInstance.option('focusedElement', getPublicElement($anchor));
  }
  return true;
}

export function closeItemWidget($item: dxElementWrapper): boolean {
  const itemInstance = getItemWidget($item);
  if (!itemInstance) {
    return false;
  }

  if (!getChildWidgetOpened(itemInstance)) {
    return false;
  }

  itemInstance.option('opened', false);
  return true;
}

export function isItemDisabled($item: dxElementWrapper, widgetDisabled: boolean): boolean {
  if (widgetDisabled) {
    return true;
  }
  if ($item.hasClass(DISABLED_STATE_CLASS)) {
    return true;
  }
  const $widget = $item.find(`.${WIDGET_CLASS}`).first();
  return $widget.length > 0 && $widget.hasClass(DISABLED_STATE_CLASS);
}

export function isItemWidgetOpened($item: dxElementWrapper): boolean {
  return getChildWidgetOpened(getItemWidget($item));
}

export function getItemFocusTarget($item: dxElementWrapper): dxElementWrapper | undefined {
  if ($item.hasClass(DROPDOWNMENU_BUTTON_CLASS)) {
    return $item;
  }

  const $widgets = $item.find(TOOLBAR_WIDGETS_SELECTOR);

  if (!$widgets.length) {
    const $nativeFocusable = $item.find(NATIVE_FOCUSABLE_SELECTOR).first();
    return $nativeFocusable.length ? $nativeFocusable : undefined;
  }

  const $widget = $widgets.first();
  const itemInstance = getComponentInstance<Widget>($widget);

  if (!itemInstance) {
    return undefined;
  }

  if ($widget.hasClass(MENU_CLASS)) return $item;
  if ($widget.hasClass(TEXTEDITOR_CLASS)) return $(itemInstance.element());

  const $base = itemInstance._focusTarget?.();
  if (getWidgetName($widget) === 'dxDropDownButton') {
    return $base?.find(`.${BUTTON_GROUP_CLASS}`);
  }
  return $base ?? $(itemInstance.element());
}

export function getPlainItemFocusTargets($item: dxElementWrapper): dxElementWrapper {
  if ($item.hasClass(DROPDOWNMENU_BUTTON_CLASS)) {
    return $();
  }

  const $widgets = $item.find(TOOLBAR_WIDGETS_SELECTOR);
  if ($widgets.length) {
    return $();
  }

  return $item.find(NATIVE_FOCUSABLE_SELECTOR);
}

export function applyItemTabIndex($item: dxElementWrapper, tabIndex: number): void {
  const $focusTarget = getItemFocusTarget($item);
  if (!$focusTarget?.length) {
    return;
  }

  const $plainTargets = getPlainItemFocusTargets($item);
  if ($plainTargets.length > 1) {
    $plainTargets.attr('tabIndex', -1);
  }

  $focusTarget.attr('tabIndex', tabIndex);

  if ($focusTarget.hasClass(TEXTEDITOR_CLASS)) {
    $focusTarget.find(`.${TEXTEDITOR_INPUT_CLASS}`).attr('tabIndex', -1);
  }

  const $menu = $item.find(`.${MENU_CLASS}`);
  if ($menu.length) {
    $menu.attr('tabIndex', -1);
    $menu.find('[tabindex]').attr('tabIndex', -1);
  }
}

export function setItemWidgetFocusState($item: dxElementWrapper, isFocused: boolean): void {
  getItemWidget($item)?._toggleFocusClass?.(isFocused, getItemFocusTarget($item));
}

export function toggleItemFocusableElementTabIndex(
  context: Toolbar | ListBase | undefined,
  item: Item,
): void {
  if (!context) return;

  const $item = context._findItemElementByItem(item);
  if (!$item.length) {
    return;
  }

  const itemData = context._getItemData($item);
  const { disabled } = context.option();
  const isItemNotFocusable = !!(itemData.options?.disabled || itemData.disabled || disabled);

  const { widget } = itemData;

  if (widget && TOOLBAR_ITEMS.includes(widget)) {
    const $widget = $item.find(widget.toLowerCase().replace('dx', '.dx-'));
    if ($widget.length) {
      const itemInstance = getComponentInstance<Widget>($widget);

      if (!itemInstance) {
        return;
      }

      const $base = itemInstance._focusTarget?.();
      const $focusTarget = widget === 'dxDropDownButton'
        ? $base?.find(`.${BUTTON_GROUP_CLASS}`)
        : ($base ?? $(itemInstance.element()));

      const tabIndex = itemData.options?.tabIndex;
      $focusTarget?.attr('tabIndex', isItemNotFocusable ? -1 : (tabIndex ?? 0));
    }
  }
}

export function wrapSpaceKey(keys: SupportedKeys): void {
  const originalSpace = keys.space;
  if (!originalSpace) {
    return;
  }

  keys.space = function guardedSpace(
    this: unknown,
    e: DxEvent<KeyboardEvent>,
    options?: KeyboardKeyDownEvent,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): void | boolean {
    if (isTextInputTarget(e.target as HTMLElement)) {
      return undefined;
    }
    return originalSpace.call(this, e, options);
  };
}

export function getAvailableItems(
  $visibleItems: dxElementWrapper,
  widgetDisabled: boolean,
  resolveFocusTarget: ($item: dxElementWrapper) => dxElementWrapper | undefined,
): dxElementWrapper {
  const elements = $visibleItems.toArray().filter(
    (item) => !isItemDisabled($(item), widgetDisabled)
      && !!resolveFocusTarget($(item))?.length,
  );

  return $(elements) as unknown as dxElementWrapper;
}

export function handleEnterKey(
  e: DxEvent<KeyboardEvent>,
  callSuper: (e: DxEvent<KeyboardEvent>) => void,
  ctx: {
    focusStateEnabled: boolean | undefined;
    focusedItem: Element | null | undefined;
    activateAtNavLevel: (e: DxEvent<KeyboardEvent>) => void;
  },
): void {
  if (!ctx.focusStateEnabled) {
    callSuper(e);
    return;
  }

  const target = e.target as HTMLElement;
  if (isTextInputTarget(target) || isMenuTarget(target)) {
    return;
  }

  ctx.activateAtNavLevel(e);
  if (e.defaultPrevented) {
    return;
  }

  const $item = $(ctx.focusedItem);
  if ($item.length) {
    const $textEditor = $item.find(`.${TEXTEDITOR_INPUT_CLASS}`).first();
    if ($textEditor.length) {
      e.preventDefault();
      eventsEngine.trigger($textEditor, 'focus');
      return;
    }
  }

  callSuper(e);
}

export function handleFocusOut(
  root: Element | undefined,
  e: DxEvent,
  callSuper: (e: DxEvent) => void,
): void {
  const { relatedTarget } = e as DxEvent & { relatedTarget: Element };
  const target = e.target as Element;

  if (relatedTarget && root?.contains(relatedTarget)) {
    return;
  }

  if (relatedTarget && $(relatedTarget).closest(`.${OVERLAY_CONTENT_CLASS}`).length) {
    return;
  }

  if (target && $(target).closest(`.${OVERLAY_CONTENT_CLASS}`).length) {
    return;
  }

  callSuper(e);
}

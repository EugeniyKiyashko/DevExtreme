import type { Orientation } from '@js/common';
import domAdapter from '@js/core/dom_adapter';
import type { dxElementWrapper } from '@js/core/renderer';
import $ from '@js/core/renderer';
import type { DxEvent } from '@js/events';
import { getPublicElement } from '@ts/core/m_element';
import eventsEngine from '@ts/events/core/m_events_engine';
import { DROPDOWNMENU_BUTTON_CLASS } from '@ts/ui/toolbar/constants';
import type ToolbarMenuList from '@ts/ui/toolbar/internal/toolbar.menu.list';
import type ToolbarBase from '@ts/ui/toolbar/toolbar.base';
import {
  applyItemTabIndex,
  closeItemWidget,
  closeOpenSubmenu,
  getItemFocusTarget as defaultGetItemFocusTarget,
  getPlainItemFocusTargets,
  isItemWidgetOpened,
  isMenuTarget,
  isTextInputTarget,
} from '@ts/ui/toolbar/toolbar.utils';

const HORIZONTAL_KEY_LOCATION: Record<string, string> = {
  ArrowRight: 'right',
  ArrowLeft: 'left',
  Home: 'first',
  End: 'last',
};

const VERTICAL_KEY_LOCATION: Record<string, string> = {
  ArrowDown: 'down',
  ArrowUp: 'up',
  Home: 'first',
  End: 'last',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RovingTabIndexHost = ToolbarBase<any> | ToolbarMenuList;

export interface RovingTabIndexOptions {
  itemsSelector: string;
  direction: Orientation;
  isEnabled: () => boolean;
  onEscape?: () => void;
  onTab?: () => void;
}

export interface FocusRestoreDescriptor {
  index: number | undefined;
  overflow: boolean;
}

export class RovingTabIndexController {
  private captureHandler?: (e: KeyboardEvent) => void;

  private $prevActiveItem?: dxElementWrapper;

  constructor(
    private readonly host: RovingTabIndexHost,
    private readonly options: RovingTabIndexOptions,
  ) {}

  private get root(): HTMLElement {
    return this.host.$element().get(0) as HTMLElement;
  }

  private getItemTabIndex($item: dxElementWrapper): number {
    const data = this.host._getItemData($item) as { options?: { tabIndex?: number } } | undefined;
    return data?.options?.tabIndex ?? 0;
  }

  private getItemIndex($item: dxElementWrapper): number | undefined {
    // `$.data` getter is typed as returning `this` in the local d.ts (only the setter
    // overload is declared), so we go through `unknown` to assert the actual stored type.
    const index = $item.data(this.host._itemIndexKey()) as unknown as number | undefined;
    return typeof index === 'number' ? index : undefined;
  }

  attach(): void {
    this.detach();
    this.attachCaptureHandler();
  }

  detach(): void {
    this.detachCaptureHandler();
    this.$prevActiveItem = undefined;
  }

  private getKeyToLocation(): Record<string, string> {
    return this.options.direction === 'horizontal'
      ? HORIZONTAL_KEY_LOCATION
      : VERTICAL_KEY_LOCATION;
  }

  private attachCaptureHandler(): void {
    const element = this.root;

    this.captureHandler = (e: KeyboardEvent): void => {
      const { target } = e;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const isTextInput = isTextInputTarget(target);
      const isMenu = isMenuTarget(target);

      if (e.key === 'Tab') {
        this.options.onTab?.();
        return;
      }

      if ((isTextInput || isMenu) && e.key !== 'Escape') {
        return;
      }

      if (e.key === 'Escape' && (isTextInput || isMenu)) {
        this.handleEscapeInsideWidget(target, e, isMenu);
        return;
      }

      if (e.key === 'Escape') {
        if (this.options.onEscape) {
          e.preventDefault();
          e.stopPropagation();
          this.options.onEscape();
        }
        return;
      }

      const location = this.getKeyToLocation()[e.key];

      if (!location) {
        return;
      }

      this.syncFocusedItem(target);

      const $focused = $(this.host.option().focusedElement);
      if ($focused.length && isItemWidgetOpened($focused)) {
        return;
      }

      if (this.moveInsidePlainItem(target, location, e)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      this.host._moveFocus(location);
      this.focusPlainItemEdge(location);
    };

    element.addEventListener('keydown', this.captureHandler, true);
  }

  private detachCaptureHandler(): void {
    if (this.captureHandler) {
      this.root.removeEventListener('keydown', this.captureHandler, true);
      this.captureHandler = undefined;
    }
  }

  private moveInsidePlainItem(
    target: HTMLElement,
    location: string,
    e: KeyboardEvent,
  ): boolean {
    if (this.options.direction !== 'horizontal' || (location !== 'left' && location !== 'right')) {
      return false;
    }

    const $focused = $(this.host.option().focusedElement);
    const $item = $(target).closest(this.options.itemsSelector);

    if (!$focused.length || $focused.get(0) !== $item.get(0)) {
      return false;
    }

    const $targets = getPlainItemFocusTargets($focused);
    if ($targets.length <= 1) {
      return false;
    }

    const targets = $targets.toArray();
    const currentIndex = targets.findIndex((
      element,
    ) => element === target || element.contains(target));
    if (currentIndex < 0) {
      return false;
    }

    const nextIndex = currentIndex + (location === 'right' ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= targets.length) {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const $nextTarget = $(targets[nextIndex]);
    $targets.attr('tabIndex', -1);
    $nextTarget.attr('tabIndex', this.getItemTabIndex($focused));
    eventsEngine.trigger($nextTarget, 'focus');

    return true;
  }

  private focusPlainItemEdge(location: string): void {
    if (this.options.direction !== 'horizontal' || (location !== 'left' && location !== 'right')) {
      return;
    }

    const $focused = $(this.host.option().focusedElement);
    const $targets = getPlainItemFocusTargets($focused);

    if ($targets.length <= 1) {
      return;
    }

    const targets = $targets.toArray();
    const edgeTarget = location === 'left' ? targets[targets.length - 1] : targets[0];
    const $edgeTarget = $(edgeTarget);

    $targets.attr('tabIndex', -1);
    $edgeTarget.attr('tabIndex', this.getItemTabIndex($focused));
    eventsEngine.trigger($edgeTarget, 'focus');
  }

  private handleEscapeInsideWidget(target: HTMLElement, e: KeyboardEvent, isMenu: boolean): void {
    if (isMenu && closeOpenSubmenu(target, e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const $item = $(target).closest(this.options.itemsSelector);
    if ($item.length && closeItemWidget($item)) {
      return;
    }

    if ($item.length) {
      this.focusItem($item);
    }
  }

  private syncFocusedItem(target: HTMLElement): void {
    let $item = $(target).closest(this.options.itemsSelector);

    if (!$item.length) {
      $item = $(target)
        .find('[tabindex="0"]')
        .closest(this.options.itemsSelector)
        .first();
    }

    if ($item.length && defaultGetItemFocusTarget($item)?.length) {
      this.host.option('focusedElement', getPublicElement($item));
    }
  }

  focusInHandler(e: DxEvent): void {
    const $target = $(e.target as Element);
    const $item = $target.closest(this.options.itemsSelector);

    if ($item.length && defaultGetItemFocusTarget($item)?.length) {
      this.host.option('focusedElement', getPublicElement($item));
    }
  }

  focusItem($item: dxElementWrapper): void {
    const $focusTarget = this.host._getItemFocusTarget($item);
    if (!$focusTarget?.length) {
      return;
    }
    eventsEngine.trigger($focusTarget, 'focus');
  }

  updateRovingTabIndex($activeItem?: dxElementWrapper): void {
    if (!this.options.isEnabled()) {
      return;
    }

    const $prev = this.$prevActiveItem;
    const prev = $prev?.get(0);
    const next = $activeItem?.get(0);

    if ($prev && prev && prev !== next && prev.isConnected) {
      applyItemTabIndex($prev, -1);
    }

    if ($activeItem?.length) {
      applyItemTabIndex($activeItem, this.getItemTabIndex($activeItem));
      this.$prevActiveItem = $activeItem;
      return;
    }

    const $first = this.host._getAvailableItems().first();
    if ($first.length) {
      applyItemTabIndex($first, this.getItemTabIndex($first));
      this.$prevActiveItem = $first;
    } else {
      this.$prevActiveItem = undefined;
    }
  }

  resetRovingTabIndex(itemsContainer: dxElementWrapper): void {
    if (!this.options.isEnabled()) {
      return;
    }

    const $allItems = itemsContainer.find(this.options.itemsSelector);
    $allItems.each((_index: number, item: Element): boolean => {
      applyItemTabIndex($(item), -1);
      return true;
    });

    this.$prevActiveItem = undefined;

    const $focused = $(this.host.option().focusedElement);
    const $available = this.host._getAvailableItems();
    const focusedEl = $focused.get(0);
    const isFocusedAvailable = !!focusedEl && $available.toArray().includes(focusedEl);
    const $newActive = isFocusedAvailable ? $focused : $available.first();

    if ($newActive.length) {
      applyItemTabIndex($newActive, this.getItemTabIndex($newActive));
      this.$prevActiveItem = $newActive;
    }
  }

  // NOTE: tri-state result consumed before a full re-render:
  // - descriptor: DOM focus was on a toolbar item -> remember it for restore;
  // - null: focus moved to a real element outside the toolbar -> drop pending state;
  // - undefined: navigation disabled or focus on body/null -> keep pending state intact
  //   (a nested re-render may run after the item DOM was already cleaned).
  captureFocusedItem(): FocusRestoreDescriptor | null | undefined {
    if (!this.options.isEnabled()) {
      return undefined;
    }

    const { root } = this;
    const active = domAdapter.getActiveElement(root);
    const insideToolbar = !!active && active !== root && root.contains(active);

    if (!insideToolbar) {
      // Focus on body/null (e.g. the focused item was removed mid re-render) keeps the
      // pending state, so a nested re-render does not lose the original capture. Focus on
      // any other real element means the user moved away -> drop the pending state.
      const body = domAdapter.getBody();
      return active && active !== body ? null : undefined;
    }

    const $item = $(active).closest(this.options.itemsSelector);
    if (!$item.length) {
      return null;
    }

    return {
      index: this.getItemIndex($item),
      overflow: $item.hasClass(DROPDOWNMENU_BUTTON_CLASS),
    };
  }

  // Returns a descriptor for $item only if it currently owns DOM focus — e.g. the focused
  // item is being disabled in place (an incremental option('items[n].disabled', true), not a
  // full re-render). The caller restores focus onto an adjacent enabled item afterwards.
  captureItemIfFocused($item: dxElementWrapper): FocusRestoreDescriptor | undefined {
    if (!this.options.isEnabled() || !$item?.length) {
      return undefined;
    }

    const { root } = this;
    const active = domAdapter.getActiveElement(root);
    const item = $item.get(0);
    if (!active || !item?.contains(active)) {
      return undefined;
    }

    return {
      index: this.getItemIndex($item),
      overflow: $item.hasClass(DROPDOWNMENU_BUTTON_CLASS),
    };
  }

  restoreFocus(descriptor: FocusRestoreDescriptor): void {
    if (!this.options.isEnabled()) {
      return;
    }

    const $available = this.host._getAvailableItems();
    if (!$available.length) {
      return;
    }

    const $target = this.resolveRestoreTarget($available, descriptor);
    if (!$target?.length) {
      return;
    }

    // NOTE: updateRovingTabIndex moves the single tab stop from the reset default
    // (first item) onto the restored target before focus, so there is never a moment
    // with two tab stops, regardless of whether focusin fires synchronously.
    this.updateRovingTabIndex($target);
    this.focusItem($target);
  }

  private resolveRestoreTarget(
    $available: dxElementWrapper,
    descriptor: FocusRestoreDescriptor,
  ): dxElementWrapper | undefined {
    const { index, overflow } = descriptor;

    if (overflow) {
      const $overflow = $available.filter(`.${DROPDOWNMENU_BUTTON_CLASS}`);
      if ($overflow.length) {
        return $overflow.first();
      }
    }

    if (index !== undefined) {
      const available = $available.toArray();
      const getIndex = (el: Element): number | undefined => this.getItemIndex($(el));

      const exact = available.find((el) => getIndex(el) === index);
      if (exact) {
        return $(exact);
      }

      const nearest = available.find((el) => {
        const elIndex = getIndex(el);
        return elIndex !== undefined && elIndex >= index;
      });

      return $(nearest ?? available[available.length - 1]);
    }

    return $available.first();
  }
}

/* eslint-disable no-underscore-dangle */
import Component from './common/component';

// eslint-disable-next-line react/prefer-stateless-function
export class ScrollableWrapper extends Component {
  update(): void {
    (this._viewRef as any).current.update();

    // eslint-disable-next-line
    return new Deferred().resolve();
  }

  _visibilityChanged(): void {
    super.repaint();
  }

  _container(): any {
    return $(this.$element).find('.dx-scrollable-container');
  }

  $content(): any {
    return $(this.$element).find('.dx-scrollable-content');
  }
  // eslint-disable-next-line class-methods-use-this
  // https://trello.com/c/UCUiKGfd/2724-renovation-renovated-components-ignores-children-when-usetemplates-returns-false
  // _useTemplates(): boolean {
  //   return false;
  // }
}

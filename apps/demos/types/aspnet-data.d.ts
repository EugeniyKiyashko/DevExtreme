// Type augmentation for devextreme-aspnet-data{,-nojquery}.
// The bundled types declare `createStore` as returning a bare `CustomStore`
// that nominally diverges from `CustomStore<any, any>` exported by devextreme
// once peer-dependency resolution puts the two classes in different module
// instances (pnpm 11 behaviour on CI). Re-declaring the modules here makes
// `createStore` return the same generic `CustomStore` the demos consume while
// preserving the original `Options` callback parameter types.
declare module 'devextreme-aspnet-data-nojquery' {
  import { CustomStore } from 'devextreme/common/data';

  export interface Options {
    key?: string | Array<string>;
    errorHandler?: (e: Error) => void;

    loadUrl?: string;
    loadParams?: Record<string, unknown>;
    loadMethod?: string;

    updateUrl?: string;
    updateMethod?: string;

    insertUrl?: string;
    insertMethod?: string;

    deleteUrl?: string;
    deleteMethod?: string;

    loadMode?: 'processed' | 'raw';
    cacheRawData?: boolean;

    onBeforeSend?: (operation: string, ajaxSettings: {
      cache?: boolean;
      contentType?: any;
      data?: any;
      dataType?: string;
      headers?: { [key: string]: any };
      method?: string;
      password?: string;
      timeout?: number;
      url?: string;
      username?: string;
      xhrFields?: { [key: string]: any };
    }) => void | PromiseLike<any> | any;
    onAjaxError?: (e: { xhr: XMLHttpRequest; error: string | Error }) => void;

    onLoading?: (loadOptions: any) => void;
    onLoaded?: (result: Array<any>) => void;

    onInserting?: (values: any) => void;
    onInserted?: (values: any, key: any) => void;

    onUpdating?: (key: any, values: any) => void;
    onUpdated?: (key: any, values: any) => void;

    onRemoving?: (key: any) => void;
    onRemoved?: (key: any) => void;

    onModifying?: Function;
    onModified?: Function;

    onPush?: (changes: Array<any>) => void;
  }

  export interface AspNetCustomStore extends Omit<CustomStore<any, any>, 'byKey'> {
    byKey(key: any | string | number): any;
  }

  export function createStore(options: Options): AspNetCustomStore;
}

declare module 'devextreme-aspnet-data' {
  import { Options, AspNetCustomStore } from 'devextreme-aspnet-data-nojquery';

  export function createStore(options: Options): AspNetCustomStore;
}

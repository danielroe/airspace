declare module '@pagefind/default-ui' {
  interface PagefindUIOptions {
    element?: string | HTMLElement
    bundlePath?: string
    showImages?: boolean
    showSubResults?: boolean
    autofocus?: boolean
  }

  export class PagefindUI {
    constructor(options: PagefindUIOptions)
  }
}

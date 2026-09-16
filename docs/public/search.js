const dialog = document.getElementById('docs-search-dialog')
const trigger = document.querySelector('.docs-search-trigger')
const results = document.getElementById('docs-search-results')
const shortcut = document.querySelector('.docs-search-trigger kbd')

if (dialog && trigger && results) {
  const bundlePath = results.dataset.bundlePath
  let loading

  const platform = navigator.userAgentData?.platform || navigator.userAgent
  if (shortcut && /mac|iphone|ipad|ipod/i.test(platform))
    shortcut.textContent = '⌘ K'

  function loadAsset(element) {
    return new Promise((resolve, reject) => {
      element.addEventListener('load', () => resolve())
      element.addEventListener('error', () => reject(new Error(`Could not load ${element.src || element.href}`)))
      document.head.append(element)
    })
  }

  async function mount() {
    dialog.dataset.state = 'loading'
    try {
      const style = document.createElement('link')
      style.rel = 'stylesheet'
      style.href = `${bundlePath}pagefind-ui.css`

      const script = document.createElement('script')
      script.src = `${bundlePath}pagefind-ui.js`

      await Promise.all([loadAsset(style), loadAsset(script)])

      // eslint-disable-next-line no-new
      new window.PagefindUI({
        element: results,
        bundlePath,
        showImages: false,
        showSubResults: true,
        autofocus: true,
      })
      delete dialog.dataset.state
    }
    catch {
      loading = undefined
      dialog.dataset.state = 'error'
    }
  }

  function load() {
    return loading ||= mount()
  }

  function open() {
    if (!dialog.open)
      dialog.showModal()
    document.body.classList.add('docs-search-open')
    return load()
  }

  trigger.addEventListener('click', open)

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || (event.target instanceof Element && event.target.closest('a[href], .docs-search-close')))
      dialog.close()
  })

  dialog.addEventListener('close', () => {
    document.body.classList.remove('docs-search-open')
    trigger.focus()
  })

  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (dialog.open)
        dialog.close()
      else
        open()
    }
  })
}

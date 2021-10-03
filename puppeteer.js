const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const util = require('util')
const wait = util.promisify(function (amount, callback) {
  if (amount && !callback) {
    callback = amount
    amount = null
  }
  return setTimeout(callback, amount || 1)
})
module.exports = {
  fetch,
  fill,
  close: () => {
    if (browser && browser.close) {
      browser.close()
      browser = null
    }
  }
}

let browser

async function fetch (method, req, redirects) {
  browser = await relaunchBrowser()
  const result = {}
  const page = await launchBrowserPage()
  page.on('error', (msg) => {
    if (msg && msg.text) {
      console.error('puppeteer page error', msg.text())
    } else {
      console.error('puppeteer page error', msg)
    }
  })
  page.on('console', (msg) => {
    // if (msg && msg.text) {
    //   console.error('puppeteer console msg', msg.text())
    // } else {
    //   console.error('puppeteer console msg', msg)
    // }
  })
  // these huge timeouts allow webhooks to be received, in production
  // you'd send an email with a link or otherwise notify your user
  // asynchronously but tests wait for webhooks to be received
  await page.setDefaultTimeout(3600000)
  await page.setDefaultNavigationTimeout(3600000)
  await page.setBypassCSP(true)
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    await request.continue()
  })
  let html
  if (redirects) {
    page.on('response', async (response) => {
      const status = await response.status()
      console.log('got response status', req.url, status)
      if (status === 302) {
        const headers = response.headers()
        result.redirect = headers.location
      }
      return status === 200
    })
  }
  await gotoURL(page, req.url)
  html = await getContent(page)
  if (!result.redirect && html.indexOf('<meta http-equiv="refresh"') > -1) {
    let redirectLocation = html.substring(html.indexOf(';url=') + 5)
    redirectLocation = redirectLocation.substring(0, redirectLocation.indexOf('"'))
    result.redirect = redirectLocation
  }
  if (result.redirect && result.redirect.indexOf('http') === 0) {
    console.log(result.redirect)
    await gotoURL(page, result.redirect)
    html = await getContent(page)
  }
  result.html = html
  await page.close()
  return result
}

async function relaunchBrowser () {
  if (browser && browser.close) {
    await browser.close()
    browser = null
  }
  const launchOptions = {
    headless: !(process.env.SHOW_BROWSERS === 'true'),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--incognito',
      '--disable-dev-shm-usage',
      '--disable-features=site-per-process'
    ],
    slowMo: 10
  }
  if (process.env.CHROMIUM_EXECUTABLE) {
    launchOptions.executablePath = process.env.CHROMIUM_EXECUTABLE
  }
  while (!browser) {
    try {
      browser = await puppeteer.launch(launchOptions)
      if (browser) {
        return browser
      }
    } catch (error) {
      console.error('error instantiating browser', error.toString())
    }
    await wait(100)
  }
}

async function launchBrowserPage () {
  let pages
  while (!pages) {
    try {
      pages = await browser.pages()
    } catch (error) {
    }
    if (pages && pages.length) {
      break
    }
    await wait(100)
  }
  if (pages && pages.length) {
    return pages[0]
  }
  let page
  while (!page) {
    try {
      page = await browser.newPage()
    } catch (error) {
    }
    if (page) {
      return page
    }
    await wait(100)
  }
}

async function gotoURL (page, url) {
  if (url.indexOf('http') !== 0) {
    throw new Error('gotoURL received invalid URL ' + url)
  }
  while (true) {
    try {
      await page.goto(url, { waitLoad: true, waitNetworkIdle: true })
      let content
      while (!content || !content.length) {
        content = await getContent(page)
      }
      return true
    } catch (error) {
      console.error('puppeteer gotoURL error', url, error.toString(), error)
    }
    await wait(100)
  }
}

async function getContent (page) {
  let html
  while (!html || !html.length) {
    try {
      html = await page.content()
      return html
    } catch (error) {
    }
    await wait(100)
  }
}
async function setCookie (page, req) {
  const cookies = await page.cookies()
  if (cookies.length) {
    return
  }
  if (!req.session) {
    return
  }
  const cookie = {
    value: req.session.sessionid,
    session: true,
    name: 'sessionid',
    url: global.dashboardServer
  }
  const cookie2 = {
    value: req.session.token,
    session: true,
    name: 'token',
    url: global.dashboardServer
  }
  while (true) {
    try {
      await page.setCookie(cookie)
      break
    } catch (error) {
    }
    await wait(100)
  }
  while (true) {
    try {
      await page.setCookie(cookie2)
      return
    } catch (error) {
    }
    await wait(100)
  }
}

async function emulate (page, device) {
  while (true) {
    try {
      await page.emulate(device)
      return
    } catch (error) {
    }
    await wait(100)
  }
}

const screenshotCache = {
}

async function saveScreenshot (device, page, number, action, identifier, scriptName, overrideTitle) {
  console.info('taking screenshot', number, action, identifier, scriptName)
  let filePath = scriptName.substring(scriptName.indexOf('/src/www/') + '/src/www/'.length)
  filePath = filePath.substring(0, filePath.lastIndexOf('.test.js'))
  filePath = path.join(process.env.SCREENSHOT_PATH, filePath)
  if (!fs.existsSync(filePath)) {
    createFolderSync(filePath)
  }
  let title
  if (identifier === '#submit-form') {
    title = 'form'
  } else if (identifier === '#submit-button') {
    const element = await getElement(page, identifier)
    let text = await getText(page, element)
    if (text.indexOf('_') > -1) {
      text = text.substring(0, text.indexOf('_'))
    } else {
      text = text.split(' ').join('-').toLowerCase()
    }
    title = text
  } else if (identifier && identifier[0] === '/') {
    const element = await getElement(page, identifier)
    let text = await getText(page, element)
    if (text.indexOf('_') > -1) {
      text = text.substring(0, text.indexOf('_'))
    } else {
      text = text.split(' ').join('-').toLowerCase()
    }
    title = text
  } else if (action === 'index') {
    title = 'index'
  } else if (identifier) {
    title = 'form'
  } else {
    title = ''
  }
  let filename
  if (overrideTitle) {
    filename = `${number}-${action}-${overrideTitle}-${device.name.split(' ').join('-')}-${global.language}.png`.toLowerCase()
  } else {
    if (title) {
      filename = `${number}-${action}-${title}-${device.name.split(' ').join('-')}-${global.language}.png`.toLowerCase()
    } else {
      filename = `${number}-${action}-${device.name.split(' ').join('-')}-${global.language}.png`.toLowerCase()
    }
  }
  if (screenshotCache[filename]) {
    return fs.writeFileSync(`${filePath}/${filename}`, screenshotCache[filename])
  }
  await page.screenshot({ path: `${filePath}/${filename}`, type: 'png' })
  if ((number === 1 && action === 'hover') ||
      (number === 2 && action === 'click')) {
    screenshotCache[filename] = fs.readFileSync(`${filePath}/${filename}`)
  }
  return title
}

async function fillForm (page, fieldContainer, body, uploads) {
  while (true) {
    try {
      await fill(page, fieldContainer, body, uploads)
      break
    } catch (error) {
      await wait(100)
    }
  }
}

async function execute (action, page, identifier) {
  let method
  switch (action) {
    case 'hover':
      method = hoverElement
      break
    case 'click':
      method = clickElement
      break
    case 'focus':
      method = focusElement
      break
  }
  const element = await getElement(page, identifier)
  if (element) {
    return method(element, page)
  }
  throw new Error('element not found ' + identifier)
}

async function getText (page, element) {
  return evaluate(page, (el) => {
    if (!el) {
      return ''
    }
    if (el.innerText && el.innerHTML.indexOf('>') === -1) {
      return el.innerText
    }
    if (el.title) {
      return el.title
    }
    for (let i = 0, len = el.children.length; i < len; i++) {
      if (el.children[i].innerText) {
        return el.children[i].innerText
      }
      if (el.children[i].title) {
        return el.children[i].title
      }
    }
  }, element)
}

async function fill (page, fieldContainer, body, uploads) {
  if (!body && !uploads) {
    return
  }
  const frame = await getOptionalApplicationFrame(page)
  let formFields = await getElement(page, fieldContainer || '#submit-form')
  if (!formFields && frame) {
    formFields = await getElement(frame, fieldContainer || '#submit-form')
  }
  if (!formFields) {
    formFields = await page.$('form')
    if (!formFields) {
      return
    }
  }
  if (uploads) {
    for (const field in uploads) {
      const element = await getElement(formFields, `#${field}`)
      if (element) {
        await uploadFile(element, uploads[field].path)
      }
      continue
    }
  }
  if (!body) {
    return
  }
  for (const field in body) {
    const element = await getElement(formFields, `#${field}`)
    if (!element) {
      const checkboxes = await getTags(formFields, 'input[type=checkbox]')
      if (checkboxes && checkboxes.length) {
        for (const checkbox of checkboxes) {
          const name = await evaluate(formFields, el => el.name, checkbox)
          if (name !== field) {
            continue
          }
          const value = await evaluate(formFields, el => el.value, checkbox)
          if (value === body[field]) {
            await evaluate(formFields, el => { el.checked = true }, checkbox)
          } else if (!body[field]) {
            await evaluate(formFields, el => { el.checked = false }, checkbox)
          }
        }
      }
      const radios = await getTags(formFields, 'input[type=radio]')
      if (radios && radios.length) {
        for (const radio of radios) {
          const name = await evaluate(formFields, el => el.name, radio)
          if (name !== field) {
            continue
          }
          const value = await evaluate(formFields, el => el.value, radio)
          if (value === body[field]) {
            await evaluate(formFields, el => { el.checked = true }, radio)
          } else if (!body[field]) {
            await evaluate(formFields, el => { el.checked = false }, radio)
          }
        }
      }
      continue
    }
    const tagName = await evaluate(formFields, el => el.tagName, element)
    if (!tagName) {
      throw new Error('unknown tag name')
    }
    await focusElement(element)
    if (tagName === 'TEXTAREA') {
      await (frame || page).$eval(`textarea[id=${field}]`, (el, value) => { el.value = value }, body[field])
    } else if (tagName === 'SELECT') {
      await selectOption(element, body[field])
    } else if (tagName === 'INPUT') {
      const inputType = await evaluate(formFields, el => el.type, element)
      if (inputType === 'radio' || inputType === 'checkbox') {
        if (body[field]) {
          await evaluate(formFields, el => { el.checked = true }, element)
        } else {
          await evaluate(formFields, el => { el.checked = false }, element)
        }
      } else {
        if (body[field]) {
          await evaluate(formFields, el => { el.value = '' }, element)
          await typeInElement(element, body[field])
        } else {
          await evaluate(formFields, el => { el.value = '' }, element)
        }
      }
    } else {
      // inaccessible input fields such as Stripe payment information
      await element.click()
      await wait(1)
      for (let i = 0, len = 100; i < len; i++) {
        await page.keyboard.press('Backspace')
        await wait(1)
      }
      if (field.endsWith('-container')) {
        for (const char of body[field]) {
          await element.focus()
          await wait(1)
          await element.type(char)
          await wait(1)
        }
      } else {
        await wait(1)
        await clickElement(element)
        await wait(1)
        await typeInElement(element, body[field])
      }
    }
  }
}

async function getElement (page, identifier) {
  const frame = await getOptionalApplicationFrame(page)
  let element
  if (identifier.startsWith('#')) {
    if (frame) {
      element = await frame.$(identifier)
      if (element) {
        return element
      }
    }
    element = await page.$(identifier)
    if (element) {
      return element
    }
    return null
  }
  let elements
  if (identifier.startsWith('/')) {
    if (frame) {
      elements = await getTags(frame, 'a')
      if (elements && elements.length) {
        for (element of elements) {
          const href = await evaluate(page, el => el.href, element)
          if (href) {
            if (href === identifier ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`) ||
              href === `${identifier}` ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`)) {
              return element
            }
          }
        }
      }
    }
    elements = await getTags(page, 'a')
    const menuLinks = []
    if (elements && elements.length) {
      for (element of elements) {
        const href = await evaluate(page, el => el.href, element)
        const isMenu = await evaluate(page, (el) => {
          return el.parentNode.id === 'account-menu' ||
                 el.parentNode.id === 'administrator-menu' ||
                 el.parentNode.parentNode.id === 'account-menu' ||
                 el.parentNode.parentNode.id === 'administrator-menu'
        }, element)
        if (isMenu) {
          menuLinks.push(element)
          continue
        }
        if (href) {
          if (href === identifier ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`) ||
              href === `${identifier}` ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`)) {
            return element
          }
        }
      }
      for (element of menuLinks) {
        const href = await evaluate(page, el => el.href, element)
        if (href) {
          if (href === identifier ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`) ||
              href === `${identifier}` ||
              href.startsWith(`${identifier}?`) ||
              href.startsWith(`${identifier}&`)) {
            return element
          }
        }
      }
    }
  }
  const tags = ['button', 'input', 'select', 'textarea', 'img']
  for (const tag of tags) {
    if (frame) {
      elements = await getTags(frame, tag)
      if (!elements || !elements.length) {
        continue
      }
      for (element of elements) {
        const text = await getText(element)
        if (text) {
          if (text === identifier || text.indexOf(identifier) > -1) {
            return element
          }
        }
      }
    }
    elements = await getTags(page, tag)
    if (!elements || !elements.length) {
      continue
    }
    for (element of elements) {
      const text = await getText(element)
      if (text) {
        if (text === identifier || text.indexOf(identifier) > -1) {
          return element
        }
      }
    }
  }
}

async function evaluate (page, method, element) {
  let fails = 0
  const active = element || page
  while (true) {
    try {
      const thing = await active.evaluate(method, element)
      return thing
    } catch (error) {
      console.error('puppeteer evaluate error', error.toString())
    }
    fails++
    if (fails > 10) {
      const content = await getContent(page)
      console.error('puppeteer evaluate fail ten times', content, global.testConfiguration, global.packageJSON)
      throw new Error('evaluate failed ten times')
    }
    await wait(100)
  }
}

async function getOptionalApplicationFrame (page) {
  if (!page.frames) {
    return null
  }
  let fails = 0
  while (true) {
    try {
      const frame = await page.frames().find(f => f.name() === 'application-iframe')
      if (frame) {
        return frame
      }
    } catch (error) {
      console.error('puppeteer getOptionalApplicationFrame error', error.toString())
    }
    fails++
    if (fails > 10) {
      return null
    }
    await wait(100)
  }
}

async function getTags (page, tag) {
  let fails = 0
  while (true) {
    try {
      const links = await page.$$(tag)
      return links
    } catch (error) {
      console.error(`puppeteer getTags(${tag}) error`, error.toString())
    }
    fails++
    if (fails > 10) {
      const content = await getContent(page)
      console.error('puppeteer getTags fail ten times', content, global.testConfiguration, global.packageJSON)
      throw new Error('getTags failed ten times')
    }
    await wait(100)
  }
}

async function hoverElement (element, page) {
  let fails = 0
  while (true) {
    try {
      await element.hover()
      return
    } catch (error) {
      console.error('puppeteer hoverElement error', error.toString())
    }
    fails++
    if (fails > 10) {
      const content = page ? await getContent(page) : null
      console.error('puppeteer hoverElement fail ten times', content, global.testConfiguration, global.packageJSON)
      throw new Error('hoverElement failed ten times')
    }
    await wait(100)
  }
}

async function clickElement (element) {
  let fails = 0
  while (true) {
    try {
      await element.click()
      return
    } catch (error) {
      console.error('puppeteer clickElement error', error.toString())
    }
    fails++
    if (fails > 10) {
      console.error('puppeteer clickElement fail ten times', element, global.testConfiguration, global.packageJSON)
      throw new Error('clickElement failed ten times')
    }
    await wait(100)
  }
}

async function focusElement (element) {
  let fails = 0
  while (true) {
    try {
      await element.focus()
      return
    } catch (error) {
      console.error('puppeteer focusElement error', error.toString())
    }
    fails++
    if (fails > 10) {
      console.error('puppeteer focusElement fail ten times', element, global.testConfiguration, global.packageJSON)
      throw new Error('focusElement failed ten times')
    }
    await wait(100)
  }
}

async function uploadFile (element, path) {
  let fails = 0
  while (true) {
    try {
      await element.uploadFile(path)
      return
    } catch (error) {
      console.error('puppeteer uploadFile error', error.toString())
    }
    fails++
    if (fails > 10) {
      console.error('puppeteer uploadFile fail ten times', element, global.testConfiguration, global.packageJSON)
      throw new Error('uploadFile failed ten times')
    }
    await wait(100)
  }
}

async function typeInElement (element, text) {
  let fails = 0
  while (true) {
    try {
      if (!text || !text.length) {
        await element.evaluate((element) => {
          element.value = ''
        }, element)
        return
      }
      await element.type(text || '')
      return
    } catch (error) {
      console.error('puppeteer typeInElement error', error.toString())
    }
    fails++
    if (fails > 10) {
      console.error('puppeteer typeInElement fail ten times', element, global.testConfiguration, global.packageJSON)
      throw new Error('typeElement failed ten times')
    }
    await wait(100)
  }
}

async function selectOption (element, value) {
  const id = await element.evaluate(element => element.id, element)
  let fails = 0
  while (true) {
    try {
      await element.evaluate((_, data) => {
        const select = document.getElementById(data.id)
        for (let i = 0, len = select.options.length; i < len; i++) {
          if (select.options[i].value === data.value ||
            select.options[i].text === data.value ||
            select.options[i].text.indexOf(data.value) === 0 ||
            select.options[i].value.indexOf(data.value) === 0) {
            select.selectedIndex = i
            return
          }
        }
      }, { id, value })
      return
    } catch (error) {
      console.error('puppeteer selectOption error', error.toString())
    }
    fails++
    if (fails > 10) {
      console.error('puppeteer selectOption fail ten times', element, global.testConfiguration, global.packageJSON)
      throw new Error('selectOption failed ten times')
    }
    await wait(100)
  }
}

function createFolderSync (folderPath) {
  const nestedParts = folderPath.split('/')
  let nestedPath = ''
  for (const part of nestedParts) {
    nestedPath += `/${part}`
    if (!fs.existsSync(nestedPath)) {
      fs.mkdirSync(nestedPath)
    }
  }
}

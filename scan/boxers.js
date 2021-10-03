const fs = require('fs')
const puppeteer = require('../puppeteer.js')

let boxrecIndex = {}

module.exports = {
  scan: scanBoxers
}

async function scanBoxers (matchFiles) {
  console.log('[boxers-scanner]', 'finding information on boxrec.com')
  const indexFilePath = `${process.env.DATA_PATH}/boxrec.json`
  if (fs.existsSync(indexFilePath)) {
    boxrecIndex = require(indexFilePath)
  } else {
    boxrecIndex = {}
  }
  const boxers = []
  const persons = {}
  for (const file of matchFiles) {
    file.boxing.boxer1 = persons[file.boxing.boxer1] = persons[file.boxing.boxer1] || await fetchBoxerInformation(file.boxing.date, file.boxing.boxer1)
    file.boxing.boxer2 = persons[file.boxing.boxer2] = persons[file.boxing.boxer2] || await fetchBoxerInformation(file.boxing.date, file.boxing.boxer2)
    if (boxers.indexOf(file.boxing.boxer1) === -1) {
      boxers.push(file.boxing.boxer1)
    }
    if (boxers.indexOf(file.boxing.boxer2) === -1) {
      boxers.push(file.boxing.boxer2)
    }
  }
  fs.writeFileSync(indexFilePath, JSON.stringify(boxrecIndex))  
  return boxers
}
    
async function fetchBoxerInformation(date, name) {
  const cacheFilePath = `${process.env.DATA_PATH}/${name}.html`
  const person = {
    name
  }
  let boxrecPage
  if (fs.existsSync(cacheFilePath)) {
    boxrecPage = JSON.parse(fs.readFileSync(cacheFilePath).toString())
    const timestamp = Math.floor(date.getTime() / 1000)
    if (timestamp > boxrecPage.date) {
      boxrecPage = null
    }
  }
  if (!boxrecPage) {
    const boxrecURL = await findBoxRecURL(name)
    if (!boxrecURL) {
      return person
    }
    const boxrecRequest = {
      url: boxrecURL
    }
    boxrecPage = await puppeteer.fetch('GET', boxrecRequest, false)
    boxrecPage.date = Math.floor(new Date().getTime() / 1000)
    fs.writeFileSync(cacheFilePath, JSON.stringify(boxrecPage))
    mapBoxRecProfiles(boxrecPage.html)
  }
  const profileTable = boxrecPage.html.substring(boxrecPage.html.indexOf('<table class="profileTable"'))
  let formattedName = boxrecPage.html.substring(boxrecPage.html.indexOf('<title>BoxRec: ') + '<title>BoxRec: '.length)
  formattedName = formattedName.substring(0, formattedName.indexOf('</title>'))
  if (formattedName === 'Login') {
    fs.unlinkSync(cacheFilePath)
    return person
  }
  person.name = formattedName
  let nationality = profileTable.substring(profileTable.indexOf('<b>nationality</b>'))
  nationality = nationality.substring(nationality.indexOf('</span>') + '</span>'.length)
  person.nationality = nationality.substring(0, nationality.indexOf('</td>')).trim()
  let division = profileTable.substring(profileTable.indexOf('<b>division</b>'))
  division = division.substring(division.indexOf('<td>') + '<td>'.length).trim()
  person.division = division.substring(0, division.indexOf('</td>')).trim()
  return person
}

function mapBoxRecProfiles(html) {
  let proboxerLinkIndex = html.indexOf('href="/en/proboxer')
  while (proboxerLinkIndex > -1) {
    html = html.substring(proboxerLinkIndex)
    let boxrecid = html.substring('href="/en/proboxer/'.length)
    boxrecid = boxrecid.substring(0, boxrecid.indexOf('"'))
    let name = html.substring(html.indexOf('>') + 1)
    name = name.substring(0, name.indexOf('<'))
    html = html.substring(html.indexOf('</a>'))
    proboxerLinkIndex = html.indexOf('href="/en/proboxer')
    boxrecIndex[name] = `https://boxrec.com/en/proboxer/${boxrecid}`
  }
  let boxerLinkIndex = html.indexOf('href="/en/boxer')
  while (boxerLinkIndex > -1) {
    html = html.substring(boxerLinkIndex)
    let boxrecid = html.substring('href="/en/boxer/'.length)
    boxrecid = boxrecid.substring(0, boxrecid.indexOf('"'))
    let name = html.substring(html.indexOf('>') + 1)
    name = name.substring(0, name.indexOf('<'))
    html = html.substring(html.indexOf('</a>'))
    boxerLinkIndex = html.indexOf('href="/en/boxer')
    boxrecIndex[name] = `https://boxrec.com/en/boxer/${boxrecid}`
  }
}

async function findBoxRecURL(name, specifyBoxer) {
  for (const keyName in boxrecIndex) {
    if (
      // first last
      keyName.toLowerCase() === name ||
      // last first
       keyName.toLowerCase() === name.split(' ').reverse().join(' ') ||
       // last
       keyName.split(' ').pop().toLowerCase() === name
    ) {
      return boxrecIndex[keyName]
    }
  }
  let boxrecURL
  if (name.indexOf(' ') > -1) {
    // find the wikipedia page for the boxer
    specifyBoxer = specifyBoxer ? '%20(boxer)' : ''
    const wikipediaRequest = {
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${name.split(' ').join('%20')}${specifyBoxer}&go=Go`
    }
    const wikipediaSearchPage = await puppeteer.fetch('GET', wikipediaRequest, true)
    let wikipediaPage
    if (wikipediaSearchPage.html.indexOf('mw-search-result-heading') === -1) {
      wikipediaPage = wikipediaSearchPage
    } else {
      let firstResultURL = wikipediaSearchPage.html.substring(wikipediaSearchPage.html.indexOf('<div class="mw-search-result-heading'))
      firstResultURL = firstResultURL.substring(firstResultURL.indexOf('<a'))
      firstResultURL = firstResultURL.substring(firstResultURL.indexOf('"') + 1)
      firstResultURL = 'https://en.wikipedia.org' + firstResultURL.substring(0, firstResultURL.indexOf('"'))
      wikipediaRequest.url = firstResultURL
      wikipediaPage = await puppeteer.fetch('GET', wikipediaRequest, true)
    }
    // find the boxrec profile url in the wikpedia page
    console.log('finding boxrec url in wikipedia page', wikipediaRequest.url)
    const proBoxerURLIndex = wikipediaPage.html.indexOf('https://boxrec.com/en/proboxer/')
    if (proBoxerURLIndex > -1) {
      boxrecURL = wikipediaPage.html.substring(proBoxerURLIndex)
    } else {
      const boxerURLIndex = wikipediaPage.html.indexOf('https://boxrec.com/en/boxer/')
      if (boxerURLIndex > -1) {
        boxrecURL = wikipediaPage.html.substring(boxerURLIndex)
        boxrecURL = boxrecURL.substring(0, boxrecURL.indexOf('"'))
      }
    }    
    console.log('found boxrecurl', boxrecURL)
  }
  if (!boxrecURL) {
    if (!specifyBoxer && name.indexOf(' ') > -1) {
      return findBoxRecURL(name, true)
    }
    // try duckduckgo search of boxrec profile, this is the last option because
    // other boxers might be returned
    console.log('checking duckduckgo for boxrecurl')
    const duckduckgoRequest = {
      url: `https://duckduckgo.com/?q=${name.split(' ').join('+')}+boxing+record+boxrec&ia=web`
    }
    const duckduckgoPage = await puppeteer.fetch('GET', duckduckgoRequest, true)
    const proBoxerURLIndex = duckduckgoPage.html.indexOf('https://boxrec.com/en/proboxer/')
    let boxrecURL
    if (proBoxerURLIndex > -1) {
      boxrecURL = duckduckgoPage.html.substring(proBoxerURLIndex)
    } else {
      const boxerURLIndex = duckduckgoPage.html.indexOf('https://boxrec.com/en/boxer/')
      if (boxerURLIndex > -1) {
        boxrecURL = duckduckgoPage.html.substring(boxerURLIndex)
        boxrecURL = boxrecURL.substring(0, boxrecURL.indexOf('"'))
      }
    }
  }
  return boxrecURL
}

const fs = require('fs')

module.exports = {
  scan
}

async function scan (matchFiles) {
  for (const file of matchFiles) {
    const matchInformation = parseMatchInformation(file.boxing.date, file.boxing.boxer1, file.boxing.boxer2)
    if (matchInformation) {
      for (const key in matchInformation) {
        file.boxing[key] = matchInformation[key]
      }
    }
  }
}

function doubleDigit (n) {
  return n < 10 ? `0${n}` : n.toString()
}

function parseMatchInformation (date, boxer1, boxer2, modified) {
  const cacheFilePath = `${process.env.DATA_PATH}/${boxer1.name.toLowerCase()}.html`
  if (!fs.existsSync(cacheFilePath)) {
    return undefined
  }
  const boxrecPage = fs.readFileSync(cacheFilePath).toString()
  const dateString = date.getFullYear() + '-' + doubleDigit(date.getMonth() + 1) + '-' + doubleDigit(date.getDate())
  const indexOfDateLink = boxrecPage.indexOf(`<a href="/en/date?date=${dateString}">${dateString}</a>`)
  if (!modified && indexOfDateLink === -1) {
    const previousDay = new Date()
    previousDay.setTime(date.getTime() - (24 * 60 * 60 * 1000))
    const minusOneDay = parseMatchInformation(previousDay, boxer1, boxer2, true)
    if (minusOneDay) {
      return minusOneDay
    }
    const nextDay = new Date()
    nextDay.setTime(date.getTime() + (24 * 60 * 60 * 1000))
    const plusOneDay = parseMatchInformation(nextDay, boxer1, boxer2, true)
    if (plusOneDay) {
      return plusOneDay
    }
    return undefined
  }
  let tableRow = boxrecPage.substring(indexOfDateLink)
  tableRow = tableRow.substring(0, tableRow.indexOf('</tbody>'))
  const nextDate = tableRow.indexOf('<a href="/en/date?date=')
  if (nextDate) {
    tableRow = tableRow.substring(0, nextDate)
  }
  let country = tableRow.substring(tableRow.indexOf('flag-icon-') + 'flag-icon-'.length)
  country = country.substring(0, country.indexOf('"')).toUpperCase()
  let locationText = tableRow.substring(tableRow.indexOf('flag-icon-'))
  if (!locationText) {
    return undefined
  }
  locationText = locationText.substring(locationText.indexOf('</span>') + '</span>'.length)
  locationText = locationText.substring(0, locationText.indexOf('<')).trim()
  const locationParts = locationText.split(',')
  const location = locationParts[0].trim()
  const city = locationParts[1].trim()
  const titles = []
  const firstTitleLink = tableRow.indexOf('<a href="/en/title/')
  if (firstTitleLink > -1) {
    let links = tableRow.substring(firstTitleLink)
    while (links.indexOf('<a href="/en/title/') > -1) {
      let title = links.substring(links.indexOf('>') + 1)
      title = title.substring(0, title.indexOf('<'))
      titles.push(title)
      links = links.substring(1)
      if (links.indexOf('<a href="/en/title/') > -1) {
        links = links.substring(links.indexOf('<a href="/en/title/'))
      }
    }
  }
  let result = tableRow.substring(tableRow.indexOf('boutResult ') + 'boutResult '.length)
  result = result.substring(0, result.indexOf('"'))
  let winner
  if (result === 'bgW') {
    winner = boxer1.name
  } else if (result === 'bgL') {
    winner = boxer2.name
  } else if (result === 'bgD') {
    winner = ''
  }
  let decision
  if (tableRow.indexOf('<td valign="center">  RTD') > -1) {
    decision = 'RTD'
  } else if (tableRow.indexOf('<td valign="center">  UD') > -1) {
    decision = 'UD'
  } else if (tableRow.indexOf('<td valign="center">  SD') > -1) {
    decision = 'SD'
  } else if (tableRow.indexOf('<td valign="center">  KO') > -1) {
    decision = 'KO'
  } else if (tableRow.indexOf('<td valign="center">  TKO') > -1) {
    decision = 'TKO'
  } else if (tableRow.indexOf('<td valign="center">  MD') > -1) {
    decision = 'MD'
  }
  return {
    winner,
    decision,
    country,
    city,
    location,
    titles
  }
}

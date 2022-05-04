const advancementFile = require('./advancement.json')
const coordinateRegex = /^x=(-?\d{1,5})y=(-?\d{1,5})z=(-?\d{1,5})$/
const poiTitleRegex = /discoverthe(.+)/
const dungeonTitleRegex = /found(.+)dungeon/
const pois = {}

function generatePois () {
  for (const advancement of Object.values(advancementFile)) {
    if (advancement.id.startsWith('monumenta:pois')) parseAdvancement(advancement, { type: 'poi' })
    if (advancement.id.startsWith('monumenta:dungeons')) parseAdvancement(advancement, { type: 'dungeon' })
  }
}

function fetchPoi (input) {
  const string = cleanString(input)
  for (const [name, content] of Object.entries(pois)) {
    if (name.includes(string)) return content
  }
  return null
}

function parseAdvancement (advancement, options) {
  const data = advancement?.display
  if (!data) return
  const title = data.title.text
  let description = data.description
  if (!description) return null
  if (!Array.isArray(description)) description = [description]
  switch (options.type) {
    case 'poi': {
      parsePoi(title, description)
      break
    }
    case 'dungeon': {
      parseDungeon(title, description)
      break
    }
  }
}

function parsePoi (title, description) {
  const poiData = { name: '', x: '0', y: '0', z: '0' }
  title = cleanString(title)
  if (!poiTitleRegex.test(title)) return
  for (const line of description) {
    const text = cleanString(line.text)
    if (poiTitleRegex.test(text)) {
      poiData.name = parsePoiTitle(text)
    } else if (coordinateRegex.test(text)) {
      const coord = parseCoordinates(text)
      poiData.x = coord.x
      poiData.y = coord.y
      poiData.z = coord.z
    }
  }
  if (!((poiData.x && poiData.y && poiData.z) === '0')) pois[poiData.name] = poiData
}

function parseDungeon (title, description) {
  const dungeonData = { name: '', x: '0', y: '0', z: '0' }
  title = cleanString(title)
  if (!dungeonTitleRegex.test(title)) return
  dungeonData.name = parseDungeonTitle(title)
  for (const line of description) {
    const text = cleanString(line.text)
    if (coordinateRegex.test(text)) {
      const coord = parseCoordinates(text)
      dungeonData.x = coord.x
      dungeonData.y = coord.y
      dungeonData.z = coord.z
    }
  }
  if (!((dungeonData.x && dungeonData.y && dungeonData.z) === '0')) pois[dungeonData.name] = dungeonData
}

function parsePoiTitle (text) {
  const [, title] = poiTitleRegex.exec(text)
  return title
}

function parseDungeonTitle (text) {
  const [, title] = dungeonTitleRegex.exec(text)
  return title
}

function parseCoordinates (text) {
  const [, x, y, z] = coordinateRegex.exec(text)
  return { x, y, z }
}

function cleanString (str) {
  return str
    .replaceAll(/'/g, '')
    .replaceAll(/\n/g, '')
    .replaceAll(/ /g, '')
    .trim()
    .toLowerCase()
}
generatePois()
fetchPoi()
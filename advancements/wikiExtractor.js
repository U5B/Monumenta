// This program extracts POI data from Monumenta's advancement data.
// Data required: POI name, region, subregion, coordinates

const axios = require('axios').default
const fs = require('fs')

let advancements
const regex = {
  coordinates: /^x=(-?\d{1,5}) y=(-?\d{1,5}) z=(-?\d{1,5})$/, // $1 = x, $2 = y, $3 = z
  poi: {
    shard: /^monumenta:pois\/([0-9a-zA-Z\-_]+)\/root$/, // $1 = shard
    region: /^monumenta:pois\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/root$/, // $1 = shard, $2 = region
    subregion: /^monumenta:pois\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/root$/, // $1 = shard, $2 = region, $3 = subregion
    short: /^monumenta:pois\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/((?!root)[0-9a-zA-Z\-_]+)$/, // $3 != root
    long: /^monumenta:pois\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/([0-9a-zA-Z\-_]+)\/((?!root)[0-9a-zA-Z\-_]+)$/ // $4 != root
  },
  dungeon: {
    path: /^monumenta:dungeons\/([0-9a-zA-Z\-_]+)\/find$/
  }
}
const pois = {}
const converter = {}
const dungeons = {}

async function fetchAdvancements () {
  if (fs.existsSync('./advancement.json')) {
    advancements = require('./advancement.json')
    return
  }
  const response = await axios.get('https://api.playmonumenta.com/advancements')
  if (response.status !== 200) throw Error(`Monumenta API returned: ${response.status} with ${response.statusText}`)
  advancements = response.data
  console.log('Writing API Data to file...')
  fs.writeFileSync('./advancement.json', JSON.stringify(advancements, null, 2))
}
function generatePois () {
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) parsePath(advancement) // parse poi regions
  }
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) verifyAdvancement(advancement, { type: 'poi' }) // parse pois
    else if (advancement.id.startsWith('monumenta:dungeons')) verifyAdvancement(advancement, { type: 'dungeon' }) // parse dungeons
  }
  console.log('Writing POI information to file...')
  fs.writeFileSync('./pois.json', JSON.stringify(pois, null, 2))
  console.log('Writing Dungeon information to file...')
  fs.writeFileSync('./dungeons.json', JSON.stringify(dungeons, null, 2))
}

function parsePath (advancement) {
  const id = advancement.id
  const data = advancement?.display
  let title = String(data.title.text)
  switch (true) {
    case regex.poi.shard.test(id): { // monumenta:pois/r1/root
      const [, region] = regex.poi.shard.exec(id)
      if (!converter[region]) converter[region] = {}
      title = title.replace(' Exploration', '') // remove Exploration at end of string
      converter[region].name = title
      console.log(`[CONVERTER] ${region}: ${title}`)
      break
    }
    case regex.poi.region.test(id): { // monumenta:pois/r1/jungle/root
      const [, region, subregion] = regex.poi.region.exec(id)
      if (!converter[region]) converter[region] = {}
      if (!converter[region][subregion]) converter[region][subregion] = {}
      converter[region][subregion].name = title
      console.log(`[CONVERTER] ${subregion}: ${title}`)
      break
    }
    case regex.poi.subregion.test(id): { // monumenta:pois/r1/jungle/south/root
      const [, region, subregion, subsubregion] = regex.poi.subregion.exec(id)
      if (!converter[region]) converter[region] = {}
      if (!converter[region][subregion]) converter[region][subregion] = {}
      if (!converter[region][subregion][subsubregion]) converter[region][subregion][subsubregion] = {}
      converter[region][subregion][subsubregion].name = title
      console.log(`[CONVERTER] ${subsubregion}: ${title}`)
      break
    }
  }
}
function verifyAdvancement (advancement, options = { type: '' }) {
  const id = advancement.id
  const display = advancement?.display

  // null checking
  if (!display) return
  const title = display.title.text
  let description = display.description
  if (!title || !description) return
  if (!Array.isArray(description)) description = [description]
  switch (options.type) {
    case 'poi': {
      parsePoi(id, display, title, description)
      break
    }
    case 'dungeon': {
      parseDungeon(id, display, title, description)
      break
    }
  }
}
function parsePoi (id, display, title, description) {
  // check if advancement has a valid path
  const longPoi = regex.poi.long.test(id)
  const shortPoi = regex.poi.short.test(id)
  if ((longPoi || shortPoi) === false) return
  // POIs can sometimes not have coordinates
  if (!description[3]?.text) return console.error(`[POI] '${title}' missing coordinates | advancement: '${id}'`)

  // generate poi information
  const data = { name: title.trim(), shard: '', region: '', subregion: '', coordinates: { x: '0', y: '0', z: '0' } }
  if (longPoi) { // monumenta:pois/r1/jungle/south/poi1
    const [, shard, region, subregion, poi] = regex.poi.long.exec(id)
    data.shard = converter[shard].name 
    data.region = converter[shard][region].name
    data.subregion = converter[shard][region][subregion].name
    data.coordinates = parseCoordinates(description[3]?.text)
    pois[data.name] = data // add data
  } else if (shortPoi) { // monumenta:pois/r1/jungle/poi1
    const [, shard, region, poi] = regex.poi.short.exec(id)
    data.shard = converter[shard].name
    data.region = converter[shard][region].name
    data.coordinates = parseCoordinates(description[3]?.text)
    pois[data.name] = data // add data
  }
}

function parseDungeon (id, display, title, description) {
  // pre checks
  if (!regex.dungeon.path.test(id)) return
  // generate dungeon information
  title = title.replace('Found ', '') // get rid of 'Found ' prefix
  const lines = {
    1: cleanDescriptionLine(description[0]?.text), // description of dungeon
    2: cleanDescriptionLine(description[1]?.text), // 'POI:' or 'Coordinates:'
    3: cleanDescriptionLine(description[2]?.text)  // POI name or coordinates data
  }
  const data = { name: title.trim(), description: lines[1], poi: '', coordinates: { x: '0', y: '0', z: '0' } }
  if (lines[2] === 'POI:') data.poi = lines[3] // hardcoding POI data (not good idea)
  for (const line of description) { // actually parse each line like a chad
    let text = cleanDescriptionLine(line.text)
    if (text === '') continue // includes ''
    if (regex.coordinates.test(text)) data.coordinates = parseCoordinates(text) // coordinates easy to parse
  }
  dungeons[data.name] = data
}

function parseCoordinates (text) {
  if (!text) return null
  if (!regex.coordinates.test(text)) return null
  const [, x, y, z] = regex.coordinates.exec(text)
  return { x, y, z }
}

function cleanDescriptionLine (text) {
  if (!text) return null
  return String(text)
    .replaceAll('\n', '')
    .replaceAll(/&#\d+; /g, '')
    .trim()
}

async function run () {
  try {
    await fetchAdvancements()
    generatePois()
  } catch (e) {
    console.error(e)
  }
}
run()

// This program extracts POI data from Monumenta's advancement data.
// Data required: POI name, region, subregion, coordinates

const axios = require('axios').default
const fs = require('fs')

let advancements
const coordinateRegex = /^x=(-?\d{1,5}) y=(-?\d{1,5}) z=(-?\d{1,5})$/ // $1 = x, $2 = y, $3 = z
const poiRegionRegex = /monumenta:pois\/([0-9a-zA-Z]+)\/root/ // $1 = region
const poiSubRegionRegex = /monumenta:pois\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/root/ // $1 = region, $2 = subregion
const poiSubSubRegionRegex = /monumenta:pois\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/root/ // $1 = region, $2 = subregion, $3 = subsubregion
const shortPoiRegex = /monumenta:pois\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)/ // $3 != root
const longPoiRegex = /monumenta:pois\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)/ // $4 != root
const pois = {}
const converter = {}
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
    if (advancement.id.startsWith('monumenta:pois')) parseId(advancement) // parse poi regions
  }
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) parsePoi(advancement) // parse pois
  }
  console.log('Writing POI information to file...')
  fs.writeFileSync('./pois.json', JSON.stringify(pois, null, 2))
}

function parseId (advancement) {
  const id = advancement.id
  const data = advancement?.display
  let title = String(data.title.text)
  switch (true) {
    case poiRegionRegex.test(id): { // monumenta:pois/r1/root
      const [, region] = poiRegionRegex.exec(id)
      if (!converter[region]) converter[region] = {}
      title = title.replace(' Exploration', '') // remove Exploration at end of string
      converter[region].name = title
      break
    }
    case poiSubRegionRegex.test(id): { // monumenta:pois/r1/jungle/root
      const [, region, subregion] = poiSubRegionRegex.exec(id)
      if (!converter[region]) converter[region] = {}
      if (!converter[region][subregion]) converter[region][subregion] = {}
      converter[region][subregion].name = title
      break
    }
    case poiSubSubRegionRegex.test(id): { // monumenta:pois/r1/jungle/south/root
      const [, region, subregion, subsubregion] = poiSubSubRegionRegex.exec(id)
      if (!converter[region]) converter[region] = {}
      if (!converter[region][subregion]) converter[region][subregion] = {}
      if (!converter[region][subregion][subsubregion]) converter[region][subregion][subsubregion] = {}
      converter[region][subregion][subsubregion].name = title
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
  if (!description[0]?.text || !description[3]?.text) return
  switch (options.type) {
    case 'poi': {
      parsePoi({ id, display, title, description })
      break
    }
    case 'dungeon': {
      parseDungeon({ id, display, title, description })
      break
    }
  }
}
function parsePoi ({ id, display, title, description }) {
  // generate poi information
  const data = { name: title.trim(), shard: '', region: '', subregion: '', coordinates: { x: '0', y: '0', z: '0' } }
  if (longPoiRegex.test(id)) { // monumenta:pois/r1/jungle/south/poi1
    const [, region, subregion, subsubregion, poi] = longPoiRegex.exec(id)
    if (poi !== 'root') {
      data.shard = converter[region].name
      data.region = converter[region][subregion].name
      data.subregion = converter[region][subregion][subsubregion].name
      data.coordinates = parseCoordinates(description[3].text)
    }
  } else if (shortPoiRegex.test(id)) { // monumenta:pois/r1/jungle/poi1
    const [, region, subregion, poi] = shortPoiRegex.exec(id)
    if (poi !== 'root') {
      data.shard = converter[region].name
      data.region = converter[region][subregion].name
      data.coordinates = parseCoordinates(description[3].text)
    }
  }
  if (!((data.coordinates.x && data.coordinates.y && data.coordinates.z) === '0')) pois[data.name] = data
}

function parseDungeon ({ id, display, title, description }) {
  // generate dungeon information
  title = title.replace('Found ', '') // get rid of 'Found ' prefix
  const data = { name: title.trim(), shard: '', region: '', subregion: '', coordinates: { x: '0', y: '0', z: '0' } }
}

function parseCoordinates (text) {
  if (!coordinateRegex.test(text)) return
  const [, x, y, z] = coordinateRegex.exec(text)
  return { x, y, z }
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

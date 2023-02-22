// This program extracts POI data from Monumenta's advancement data.
// Data required: POI name, region, subregion, coordinates
require('dotenv').config()
const registry = require('prismarine-registry')('1.16')
const ChatMessage = require('prismarine-chat')(registry)
const axios = require('axios').default
const fs = require('fs')

let advancements
const regex = {
  poi: {
    shard: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard
    region: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region
    subregion: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region, $3 = subregion
    short: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $3 != 'root'
    long: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $4 != 'root'
    suffix: /^(.+) Exploration$/ // ignore suffix 'Exploration' from end of region
  },
  dungeon: {
    path: /^monumenta:dungeons\/([0-9a-zA-Z-_.]+)\/find$/, // dungeon path
    prefix: /^Found(?: the)? (.+)/, // ignore prefix 'Found' or 'Found the' in dungeon titles
    poi: /POI: (.+) Coordinates.*/
  },
  quest: {
    path: /^monumenta:quests\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $1 = region, $2 = quest && $2 != 'root'
    city: /Discover the (.+)/, // ignore prefix 'Discover the' fromcities
    ignore: /(.+) Quests/
  },
  handbook: {
    enchantments: /^monumenta:handbook\/enchantments\/([0-9a-zA-Z-_.]+)$/,
    ignore: /^monumenta:handbook\/enchantments\/root$/,
    sites: /^monumenta:handbook\/important_sites\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)$/
  },
  description: {
    // r1 and r2 coordinates
    coordinates: /x=(-?\d{1,5}) y=(-?\d{1,5}) z=(-?\d{1,5})/, // $1 = x, $2 = y, $3 = z
    // r3 coordinates
    coordinatesr3: /(-?\d{1,5}) (-?\d{1,5}) (-?\d{1,5})/, // $1 = x, $2 = y, $3 = z
    colorcodes: /&#\d+;/g,
    newlines: / ?\n ?/g
  }
}
const converter = {
  poi: {},
  quest: {},
  sites: {},
  enchantments: {}
}
const pois = {}
const dungeons = {}
const quests = {}
const enchantments = {}
const all = {}

async function fetchAdvancements () {
  if (fs.existsSync('./advancement.json') && process.env.DEBUG === 'true') {
    console.log('[FILE] Loading advancements from existing file...')
    advancements = require('./advancement.json')
    return
  }
  console.log('[API] Fetching advancements from Monumenta API')
  const response = await axios.get('https://api.playmonumenta.com/advancements')
  if (response.status !== 200) throw Error(`Monumenta API returned: ${response.status} with ${response.statusText}`)
  advancements = response.data
  console.log('[FILE] Writing advancements to file...')
  fs.writeFileSync('./advancement.json', JSON.stringify(advancements, null, 2))
}

function generate () {
  console.log('[CONVERTER] Mapping paths to names...')
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) convertPoi(advancement) // parse poi regions
    else if (advancement.id.startsWith('monumenta:handbook')) convertHandbook(advancement)
    else if (advancement.id.startsWith('monumenta:quest')) convertQuest(advancement)
  }
  console.log('[CONVERTER] Done.')
  console.log('[PARSER] Parsing POI & Advancement data...')
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) parseAdvancement(advancement, { type: 'poi' }) // parse pois
    else if (advancement.id.startsWith('monumenta:dungeons')) parseAdvancement(advancement, { type: 'dungeon' }) // parse dungeons
    else if (advancement.id.startsWith('monumenta:quest')) parseAdvancement(advancement, { type: 'quest' })
    else if (advancement.id.startsWith('monumenta:handbook')) parseAdvancement(advancement, { type: 'handbook' })
  }
  console.log('[PARSER] Done.')
  console.log('[ALL] Saving all advancements to readable file')
  for (const advancement of Object.values(advancements)) {
    parseAny(advancement)
  }
  console.log('[ALL] Done.')
  console.log('[FILE] Creating output directory...')
  if (!fs.existsSync('./out')) fs.mkdirSync('./out')
  console.log('[FILE] Writing POI data to file...')
  fs.writeFileSync('./out/pois.json', JSON.stringify(pois, null, 2))
  console.log('[FILE] Writing Dungeon data to file...')
  fs.writeFileSync('./out/dungeons.json', JSON.stringify(dungeons, null, 2))
  console.log('[FILE] Writing Quest data to file...')
  fs.writeFileSync('./out/quests.json', JSON.stringify(quests, null, 2))
  console.log('[FILE] Writing Enchantment data to file...')
  fs.writeFileSync('./out/enchantments.json', JSON.stringify(enchantments, null, 2))
  console.log('[FILE] Writing converter data to file...')
  fs.writeFileSync('./out/converter.json', JSON.stringify(converter, null, 2))
  console.log('[FILE] Writing all data to file...')
  fs.writeFileSync('./out/all.json', JSON.stringify(all, null, 2))
}

function convertPoi (advancement) {
  const id = advancement.id
  const data = advancement?.display
  const title = data.title
  if (!title) return

  const parsedTitle = parseChatJson(title)
  switch (true) {
    // poi converter paths
    case regex.poi.shard.test(id): { // monumenta:pois/r1/root
      const [, region] = regex.poi.shard.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      const poiTitle = parsedTitle.replace(regex.poi.suffix, '$1') // remove Exploration at end of string
      converter.poi[region].name = poiTitle
      break
    }
    case regex.poi.region.test(id): { // monumenta:pois/r1/jungle/root
      const [, region, subregion] = regex.poi.region.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      if (!converter.poi[region][subregion]) converter.poi[region][subregion] = {}
      converter.poi[region][subregion].name = parsedTitle
      break
    }
    case regex.poi.subregion.test(id): { // monumenta:pois/r1/jungle/south/root
      const [, region, subregion, subsubregion] = regex.poi.subregion.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      if (!converter.poi[region][subregion]) converter.poi[region][subregion] = {}
      if (!converter.poi[region][subregion][subsubregion]) converter.poi[region][subregion][subsubregion] = {}
      converter.poi[region][subregion][subsubregion].name = parsedTitle
      break
    }
  }
}

function convertQuest (advancement) {
  const id = advancement.id
  const data = advancement?.display

  if (!regex.quest.path.test(id)) return
  const [, region, quest] = regex.quest.path.exec(id)
  if (!regex.quest.path.test(advancement.parent)) return
  const [, preRegion, preQuest] = regex.quest.path.exec(advancement.parent)
  converter.quest[quest] = preQuest
}

function convertHandbook (advancement) {
  const id = advancement.id
  const data = advancement?.display
  const title = data.title
  const description = data.description
  if (!title || !description) return

  const titlePrint = parseChatJson(title)
  const descriptionPrint = parseChatJson(description)
  switch (true) { // monumenta:handbook/r1/site
    case regex.handbook.sites.test(id): {
      const [, region, site] = regex.handbook.sites.exec(id)
      if (!converter.sites[region]) converter.sites[region] = {}
      if (!converter.sites[region][site]) converter.sites[region][site] = {}
      converter.sites[region][site].name = titlePrint
      converter.sites[region][site].description = descriptionPrint
      break
    }
    case regex.handbook.enchantments.test(id): {
      const [, enchantment] = regex.handbook.enchantments.exec(id)
      if (regex.handbook.ignore.test(advancement.parent) && titlePrint !== 'Agility') { // Exclude Agility
        if (!converter.enchantments.category) converter.enchantments.category = {}
        converter.enchantments.category[enchantment] = {}
        converter.enchantments.category[enchantment].name = titlePrint
        converter.enchantments.category[enchantment].description = descriptionPrint
      } else if (regex.handbook.enchantments.test(advancement.parent)) {
        const [, previousEnchantment] = regex.handbook.enchantments.exec(advancement.parent)
        if (!converter.enchantments.pre) converter.enchantments.pre = {}
        converter.enchantments.pre[enchantment] = previousEnchantment
      }
      break
    }
  }
}

function parseAny (advancement) {
  const id = advancement.id
  const display = advancement.display

  // null checking
  if (!display) return
  const title = display.title
  const description = display.description
  if (!title || !description) return
  const parsedTitle = parseChatJson(title)
  const parsedDescription = parseChatJson(description)

  all[advancement.id] = {
    title: parsedTitle,
    description: parsedDescription
  }
}

function parseAdvancement (advancement, options = { type: '' }) {
  const id = advancement.id
  const display = advancement?.display

  // null checking
  if (!display) return
  const title = display.title
  const description = display.description
  if (!title || !description) return
  const option = { id, display, title, description, advancement }
  switch (options.type) {
    case 'poi': {
      parsePoi(option)
      break
    }
    case 'dungeon': {
      parseDungeon(option)
      break
    }
    case 'quest': {
      parseQuest(option)
      break
    }
    case 'handbook': {
      parseHandbook(option)
      break
    }
  }
}

function parsePoi ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // check if advancement has a valid path
  const longPoi = regex.poi.long.test(id)
  const shortPoi = regex.poi.short.test(id)
  if ((longPoi || shortPoi) === false) return
  // generate poi information
  const data = { name: parsedTitle.trim(), shard: '', region: '', subregion: '', coordinates: null }
  if (longPoi) { // monumenta:pois/r1/jungle/south/poi1
    const [, shard, region, subregion] = regex.poi.long.exec(id)
    data.shard = converter.poi[shard].name
    data.region = converter.poi[shard][region].name
    data.subregion = converter.poi[shard][region][subregion].name
    data.coordinates = parseCoordinates(parsedDescription)
    // coordinates may be missing
    if (!data.coordinates) console.error(`[POI] '${parsedTitle}' missing coordinates | advancement: '${id}'`)
    if (!pois[data.name]) pois[data.name] = data // add data
    else console.error(`[POI] '${parsedTitle}' has duplicate name | advancement: '${id}'`)
  } else if (shortPoi) { // monumenta:pois/r1/jungle/poi1
    const [, shard, region] = regex.poi.short.exec(id)
    data.shard = converter.poi[shard].name
    data.region = converter.poi[shard][region].name
    data.subregion = null
    data.coordinates = parseCoordinates(parsedDescription)
    // coordinates may be missing
    if (!data.coordinates) console.error(`[POI] '${parsedTitle}' missing coordinates | advancement: '${id}'`)
    if (!pois[data.name]) pois[data.name] = data // add data
    else console.error(`[POI] '${parsedTitle}' has duplicate name | advancement: '${id}'`)
  }
}

function parseDungeon ({ id, display, title, description, advancement }) {
  let parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // pre checks
  if (!regex.dungeon.path.test(id)) return

  // generate dungeon information
  parsedTitle = parsedTitle.replace(regex.dungeon.prefix, '$1') // get rid of 'Found ' prefix on dungeon name
  const data = { name: parsedTitle.trim(), description: null, poi: '', coordinates: null }
  data.description = parseChatJson(description[0])
  data.poi = parsePois(parsedDescription)
  if (!data.poi) console.error(`[DUNGEON] '${parsedTitle}' missing poi data | advancement: '${id}'`)
  data.coordinates = parseCoordinates(parsedDescription)
  if (!data.coordinates) console.error(`[DUNGEON] '${parsedTitle}' missing coordinates | advancement: '${id}'`)
  if (!dungeons[data.name]) dungeons[data.name] = data // add data
  else console.error(`[DUNGEON] '${parsedTitle} has duplicate name | advancement: '${id}'`)
}

function parseQuest ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // pre checks
  if (regex.quest.ignore.test(parsedTitle.trim())) return // ignore `xxx Quests`
  if (regex.quest.city.test(parsedDescription)) return

  const data = { name: parsedTitle, description: '', region: '', city: '' }
  data.description = parsedDescription // make description into one line
  if (regex.quest.path.test(id)) { // add region information
    const [, region, quest] = regex.quest.path.exec(id)
    data.region = converter.poi[region].name // use POI mapping
    const site = checkQuest(quest)
    if (!site) {
      data.city = null
    } else {
      data.city = converter.sites[region][site].name
    }
  }
  if (!quests[data.name]) quests[data.name] = data // add data
  else console.error(`[QUEST] '${title}' has duplicate name | advancement: '${id}'`)
}

function parseHandbook ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title)
  const parsedDescription = parseChatJson(description)
  switch (true) {
    case regex.handbook.enchantments.test(id): {
      if (regex.handbook.ignore.test(id) && title !== 'Agility') break
      const data = { name: parsedTitle, description: parsedDescription, category: '' }
      const [, enchantment] = regex.handbook.enchantments.exec(id)
      data.category = checkEnchantment(enchantment)
      enchantments[enchantment] = data
      break
    }
  }
}

function checkQuest (name = '') { // recursively check for quests
  if (name === '') return null
  for (const [region] of Object.entries(converter.sites)) {
    for (const [site] of Object.entries(converter.sites[region])) {
      if (name === site) return site
    }
  }
  if (!converter.quest[name]) return null // quests that don't "technically" have a city associated with them
  const value = checkQuest(converter.quest[name])
  return value
}

function checkEnchantment (name = '') { // recursively check for enchantments
  if (name === '') return null
  for (const [category, data] of Object.entries(converter.enchantments.category)) {
    if (name === category) return data.name
  }
  if (!converter.enchantments.pre[name]) return null
  const value = checkEnchantment(converter.enchantments.pre[name])
  return value
}

function parseCoordinates (text) {
  if (!text) return null
  if (regex.description.coordinates.test(text)) {
    const [, x, y, z] = regex.description.coordinates.exec(text)
    return { x, y, z }
  } else if (regex.description.coordinatesr3.test(text)) {
    const [, x, y, z] = regex.description.coordinatesr3.exec(text)
    return { x, y, z }
  }
  return null
}

function parsePois (text) {
  if (!text) return null
  if (regex.dungeon.poi.test(text)) {
    const [, poi] = regex.dungeon.poi.exec(text)
    return poi
  }
  return null
}

function parseChatJson (json = '') {
  if (!json) return null
  const msg = new ChatMessage(json)
  return cleanDescriptionLine(msg.toString())
}

function cleanDescriptionLine (text = '') {
  if (!text) return null
  return String(text)
    .replaceAll(regex.description.colorcodes, '') // clean color codes
    .replaceAll(regex.description.newlines, ' ') // clean new lines
    .trim() // get rid of trailing whitespaces
}

async function run () {
  try {
    await fetchAdvancements()
    generate()
  } catch (e) {
    console.error(e)
  }
}
run()

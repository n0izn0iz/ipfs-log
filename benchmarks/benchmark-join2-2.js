'use strict'

const IPFS = require('ipfs')
const IPFSRepo = require('ipfs-repo')
const DatastoreLevel = require('datastore-level')
const Log = require('../src/log')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')

const leveldown = require('leveldown')
const storage = require('orbit-db-storage-adapter')(leveldown)
// State
let ipfs
let log1, log2

// Metrics
let totalQueries = 0
const queryLoop = async () => {
  try {
    await Promise.all([
      log1.append('a' + totalQueries),
      log2.append('b' + totalQueries)
    ])

    await log1.join(log2)
    await log2.join(log1)
    totalQueries++
    setImmediate(queryLoop)
  } catch (e) {
    console.error(e)
    process.exit(0)
  }
}

let run = (() => {
  console.log('Starting benchmark...')

  const repoConf = {
    storageBackends: {
      blocks: DatastoreLevel
    }
  }

  ipfs = new IPFS({
    repo: new IPFSRepo('./ipfs-log-benchmarks/ipfs', repoConf),
    start: false,
    EXPERIMENTAL: {
      pubsub: true
    }
  })

  ipfs.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  ipfs.on('ready', async () => {
    // Use memory store to test without disk IO
    // const memstore = new MemStore()
    // ipfs.dag.put = memstore.put.bind(memstore)
    // ipfs.dag.get = memstore.get.bind(memstore)

    const signingKeysPath = './benchmarks/ipfs-log-benchmarks/keys'
    const store = await storage.createStore(signingKeysPath)
    const keystore = new Keystore(store)
    const identityProvider = new IdentityProvider({ keystore })
    const identity = await identityProvider.createIdentity({ id: 'userA' })
    const identity2 = await identityProvider.createIdentity({ id: 'userB' })

    log1 = new Log(ipfs, identity, identityProvider, { logId: 'A' })
    log2 = new Log(ipfs, identity2, identityProvider, { logId: 'A' })

    const amount = 100000
    console.log('log length:', amount)

    console.log('Writing log...')
    const st3 = new Date().getTime()
    for (let i = 0; i < amount; i++) {
      await log1.append('a' + i, 64)
    }
    const et3 = new Date().getTime()
    console.log('write took', (et3 - st3), 'ms')

    console.log('Joining logs...')
    const st = new Date().getTime()
    await log2.join(log1)
    const et = new Date().getTime()
    console.log('join took', (et - st), 'ms')

    console.log('Loading log...')
    const st2 = new Date().getTime()
    const l2 = await Log.fromEntryHash(ipfs, identity, identityProvider, log1.heads[0].hash, { logId: 'A' })
    const et2 = new Date().getTime()
    console.log('load took', (et2 - st2), 'ms')
    console.log('Entry size:', Buffer.from(JSON.stringify(l2.heads)).length, 'bytes')
    // console.log(log2.heads)
    console.log('log length:', log2.values.length)
    // console.log(log2.values.map(e => e.payload))
  })
})()

module.exports = run
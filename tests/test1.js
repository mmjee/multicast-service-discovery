const { MSDDiscoverer } = require('..')

const GROUP_ID = Buffer.from('55c545258c440a731a50810425bc', 'hex')

async function main () {
  // eslint-disable-next-line no-unused-vars
  const msd = new MSDDiscoverer({
    multicastGroupID: GROUP_ID
  })
}

main().catch(e => console.error(e))

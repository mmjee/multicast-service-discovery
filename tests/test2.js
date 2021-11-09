const crypto = require('crypto')
const { MSDInstance } = require('..')

const INSTANCE_ID = crypto.randomBytes(4).toString('hex')
const GROUP_ID = Buffer.from('55c545258c440a731a50810425bc', 'hex')

async function main () {
  // eslint-disable-next-line no-unused-vars
  const msd = new MSDInstance({
    url: 'http://localhost:8080',
    id: INSTANCE_ID
  }, {
    multicastGroupID: GROUP_ID
  })
}

main().catch(e => console.error(e))

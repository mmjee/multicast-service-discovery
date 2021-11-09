const udp = require('dgram')

const { Address6 } = require('ip-address')
const msgpackr = require('msgpackr')
const Ajv = require('ajv/dist/jtd')
const isURL = require('is-url')
const sub = require('date-fns/sub')
const isBefore = require('date-fns/isBefore')

const MSD_PORT_NUMBER = 53566

const MESSAGE_TYPES = {
  DISCOVER: 0x01,
  ANNOUNCE: 0x02,
  LOGOFF: 0x03
}

const HOST_SCHEMA = {
  properties: {
    url: {
      type: 'string'
    },
    id: {
      type: 'string'
    }
  }
}

const PACKET_SCHEMA = {
  properties: {
    t: {
      type: 'uint8'
    },
    h: {
      ref: 'host',
      nullable: true
    }
  },
  definitions: {
    host: HOST_SCHEMA
  }
}

const ajv = new Ajv()
const validateHost = ajv.compile(HOST_SCHEMA)
const validatePacket = ajv.compile(PACKET_SCHEMA)
// Old-style Multicast Address (RFC 2373), link local
const MulticastPrefix = Buffer.from([0xFF, 0x02])

class MSDValidationError extends Error {
  constructor (errors) {
    super()
    this.errors = errors
  }
}

class MSDInvalidGroupIDError extends Error {}

class MSDBase {
  constructor ({
    multicastGroupID,
    multicastInterface = process.env.MSD_MULTICAST_INTERFACE
  }) {
    // Multicast Group IDs are 14 bytes, see RFC 4291
    if (!Buffer.isBuffer(multicastGroupID) || multicastGroupID.length !== (112 / 8)) {
      throw new MSDInvalidGroupIDError('Invalid Multicast Group ID')
    }
    {
      // Build up a IPv6 address
      const buf = Buffer.concat([MulticastPrefix, multicastGroupID], 128 / 8)
      this.address = Address6.fromUnsignedByteArray(buf)
      this.addressCanonical = this.address.canonicalForm()
    }
    this.multicastInterface = multicastInterface

    console.log('MSD | Canonical Address Formed:', this.addressCanonical)

    this.socket = udp.createSocket('udp6')
    this.socket.unref()
    this.socket.on('error', this.onError.bind(this))
    this.socket.on('message', this.onMessage.bind(this))
    this.socket.on('listening', this.onListening.bind(this))
    this.socket.bind(MSD_PORT_NUMBER)
  }

  sendToSocket (buf, addr) {
    return new Promise((resolve, reject) => {
      return this.socket.send(buf, MSD_PORT_NUMBER, addr ?? this.addressCanonical, (err, whatever) => {
        if (err) {
          reject(err)
        } else {
          resolve(whatever)
        }
      })
    })
  }

  sendPacket (data, ...args) {
    const encoded = msgpackr.encode(data)
    return this.sendToSocket(encoded, ...args)
  }

  sendOurInfo (addr) {
    return this.sendPacket({
      t: MESSAGE_TYPES.ANNOUNCE,
      h: this.hostConfig
    }, addr)
  }

  broadcastDiscover () {
    return this.sendPacket({
      t: MESSAGE_TYPES.DISCOVER,
      h: null
    })
  }

  onError (e) {
    console.log('MSD | E:', e)
  }

  onMessage (msg, info) {
    let decoded
    try {
      decoded = msgpackr.decode(msg)
    } catch (e) {
      console.log('MSD | ME:', e, info)
      return false
    }
    const isOK = validatePacket(decoded)
    if (!isOK) {
      console.log('MSD | VE:', validatePacket.errors, info)
      return false
    }

    return decoded
  }

  async onListening () {
    this.socket.setBroadcast(true)
    this.socket.setMulticastTTL(128)
    this.socket.addMembership(this.addressCanonical, this.multicastInterface)
  }
}

// noinspection JSDuplicateCaseLabel
class MSDDiscoverer extends MSDBase {
  constructor (multicastConfig) {
    super(multicastConfig)

    this.instances = new Map()
    this.discoverInterval = setInterval(this.onInterval.bind(this), 1000 * 60)
    this.cleanupInterval = setInterval(this.cleanup.bind(this), 1000 * 60 * 2)
    this.onInterval().catch(e => console.error(e))
  }

  onInterval () {
    return this.broadcastDiscover()
  }

  cleanup () {
    const twoMinsAgo = sub(new Date(), {
      minutes: 2
    })
    for (const [id, instance] of this.instances.entries()) {
      if (isBefore(instance.lastSeen, twoMinsAgo)) {
        this.instances.delete(id)
      }
    }
    console.log('MSD | Instances Now:', this.instances)
  }

  onMessage (msg, info) {
    const decoded = super.onMessage(msg, info)
    if (!decoded) {
      return
    }

    switch (decoded.t) {
      // One of the few cases where it is useful, don't write this off
      case MESSAGE_TYPES.ANNOUNCE:
      case MESSAGE_TYPES.LOGOFF:
        if (decoded.h == null) {
          console.log('MSD | H is null', info)
          return
        }
      // eslint-disable-next-line no-duplicate-case,no-fallthrough
      case MESSAGE_TYPES.ANNOUNCE:
        this.instances.set(decoded.h.id, {
          ...decoded.h,
          lastSeen: new Date()
        })
        break
      // eslint-disable-next-line no-duplicate-case
      case MESSAGE_TYPES.LOGOFF:
        this.instances.delete(decoded.h.id)
        break
    }

    console.log('MSD | Instances Now:', this.instances)
  }
}

class MSDInstance extends MSDBase {
  constructor (hostConfig, multicastConfig) {
    super(multicastConfig)

    const hostOK = validateHost(hostConfig)
    if (!hostOK) {
      throw new MSDValidationError(validateHost.errors)
    } else if (!isURL(hostConfig.url)) {
      throw new MSDValidationError(['URL Invalid'])
    } else if (hostConfig.id.length !== 8) {
      throw new MSDValidationError(['ID Length Not Equal to 8'])
    } else {
      this.hostConfig = hostConfig
    }

    this.onProcessExit = this.onProcessExit.bind(this)
    process.on('beforeExit', this.onProcessExit)
  }

  onProcessExit () {
    return this.sendPacket({
      t: MESSAGE_TYPES.LOGOFF,
      h: this.hostConfig
    })
  }

  async onListening () {
    await super.onListening()
    await this.sendOurInfo()
  }

  onMessage (msg, info) {
    const decoded = super.onMessage(msg, info)
    if (!decoded) {
      return
    }

    switch (decoded.t) {
      case MESSAGE_TYPES.DISCOVER:
        return this.sendOurInfo(info.address)
    }
  }
}

exports.MSDValidationError = MSDValidationError
exports.MSDInvalidAddressError = MSDInvalidGroupIDError
exports.MSDDiscoverer = MSDDiscoverer
exports.MSDInstance = MSDInstance

### Basic protocol

#### Constants
```javascript
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
```

Data is just MessagePack-encoded UDP packets on a link local IPv6 multicast address.

#### What happens

##### Discoverer side

You start by sending 
a `MESSAGE_TYPES.DISCOVER` message, and all running instances will respond with a `MESSAGE_TYPES.ANNOUNCE` packet, to **your link-local address (not the multicast address)**.

##### Instance side

On startup, you send a `MESSAGE_TYPES.ANNOUNCE` packet, and all discoverers automatically add you to their list of running instances.

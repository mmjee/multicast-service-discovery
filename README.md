#### What

A very simple library to implement Multicast Service Discovery for instances of something.

#### Why

If you are running a service that is horizontally scalable, you must have pondered over the question of how to dynamically scale it without manual configuration.

Often the answer to that is some kind of L2 layer discovery, but outside of the locked down Kubernetes ecosystem or DNS-SD (which isn't very lightweight at all), there is no easy to use solution to that.

This is sort of a proof of concept, but it also works well (and is fairly performant).

##### Presumptions

The original presumption was that you have a service (that probably should be one container per logical host, maximal usage) with many instances distributed over a datacenter or some self-healing L2 network like ZeroTier.

So you may have N servers in a datacenter that are connected to the same L2 network (most providers offer some kind of VLAN service for this), and need a way to know from the outside which instances are up, whether they are functioning well (fork this to add your metrics), et cetra.

With the list of instances currently active, you can do two principal things:

1. Let the client automatically load balance, on the first request you make to your API (make a separate service API for this) query all alive instances. Let the client select a random one from the list or select one yourself. This is especially useful if each instance of yours is directly reachable (IPv6 and Cloudflare, or something like that) and the URLs you are indicating are end-user.
   1. Might want to check out Greenlock ([see this for how I do it](https://github.com/mmjee/simple-container-https-le)).
   2. Automatically add AAAA records using a DNS API (something like \<instance-id\>.\<service\>.yourdomain.tld, and then use Greenlock to generate certificates for the domain. Using a CDN here is great because it'll terminate IPv4 connections for you, allowing you to bypass all that pain.
   4. The manifest API can be infinitely scaled using more traditional ways, as discoverers and instances are M:N scalable.
2. Use a load balancer (but then it becomes a SPoF), the load balancer queries available instances and distributes load uniformly.
   1. There'll be an example implementation soon.

#### How

Simple multicast discoverer/instance broadcasts packets into a IPv6 link-local address (you don't actually need IPv6 connectivity for this).

###### Instance

```javascript
const { MSDInstance } = require('@mojee/multicast-service-discovery')

// The URL is used by the load balancer, ID is anything unique to the individual instance
// Your IPv6 address is probably a good one for this
// const addr = require('internal-ip').v6.sync()
const msd = new MSDInstance({
  // `http://[${addr}]:<your port>`
  url: 'http://localhost:8080',
  id: INSTANCE_ID // addr
}, {
  // This should be something unique to your current project
  // You can generate something random by
  // openssl rand -hex 14
  multicastGroupID: Buffer.from('55c545258c440a731a50810425bc', 'hex')
})
```

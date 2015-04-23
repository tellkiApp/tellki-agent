![Auth pic](http://i.imgur.com/cm9Nyxp.jpg)
tellki-agent
============

Tellki Agent is a component used by tellki.com to execute instructions and gather metrics on the server.
Uses Websocket (WSS) to comunicate between the client server and the Tellki Agent controller.

Can be installed through npm.

```
npm install -g tellki-agent
```
* use -g for global installation

To start your agent you need to create and account on tellki.com a receive the activation key.
Start the agent using the following instruction

```
tellkiagent-setup -install -key {KEY}
```
* replace {KEY} with the correct key
============
**For more information just visit http://tellki.com**


**For support visit http://support.tellki.com/**

![Auth pic](http://i.imgur.com/qfPAzIC.png)

Tellki Agent is a component used by tellki.com to execute instructions, actions and gather metrics on the server.
Uses Websocket (WSS) to comunicate between the client server and the Tellki Agent controller.

Can be installed through npm.

```
npm install -g tellki-agent
```
* use -g for global installation

To start your agent you need to create and account on https://tellki.com a receive the activation key.
Start the agent using the following instruction

```
tellkiagent-setup -install -key {KEY} [-tags {tag1,tag2,...} -uuid {AGENT_UUID}]
```
* replace {KEY} with the correct key
* -tags - allows you to start the agent with the monitors with the tags indicated
* -uuid - allows you to recover the agent configuration

**For more information just visit https://tellki.com**

**For support visit http://support.tellki.com/**

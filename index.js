const executor = require('./executor.js')
const globalMgmt = require('./globalMgmt.js')
const loadScriptOrder = require('./loadScriptOrder.js')
const secretMgmt= require('./secretMgmt.js')
const runCollection= require('./runCollection.js')

module.exports = {
...executor,
...globalMgmt,
...loadScriptOrder,
...secretMgmt,
...runCollection
};

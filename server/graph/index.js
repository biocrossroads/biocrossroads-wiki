const _ = require('lodash')
const fs = require('fs')
// const gqlTools = require('graphql-tools')
const path = require('path')
const autoload = require('auto-load')
const PubSub = require('graphql-subscriptions').PubSub
const { LEVEL, MESSAGE } = require('triple-beam')
const Transport = require('winston-transport')
const { createRateLimitTypeDef, createRateLimitDirective } = require('graphql-rate-limit-directive')

/* global WIKI */

WIKI.logger.info(`Loading GraphQL Schema...`)

// Init Subscription PubSub

WIKI.GQLEmitter = new PubSub()

// Schemas

let typeDefs = [createRateLimitTypeDef()]
let schemas = fs.readdirSync(path.join(WIKI.SERVERPATH, 'graph/schemas'))
schemas.forEach(schema => {
  typeDefs.push(fs.readFileSync(path.join(WIKI.SERVERPATH, `graph/schemas/${schema}`), 'utf8'))
})

// Resolvers

let resolvers = {}
const resolversObj = _.values(autoload(path.join(WIKI.SERVERPATH, 'graph/resolvers')))
resolversObj.forEach(resolver => {
  _.merge(resolvers, resolver)
})

// Directives

let schemaDirectives = {
  ...autoload(path.join(WIKI.SERVERPATH, 'graph/directives')),
  rateLimit: createRateLimitDirective({
    keyGenerator: (directiveArgs, source, args, context, info) => `${context.req.ip}:${info.parentType}.${info.fieldName}`
  })
}

// Live Trail Logger (admin)

class LiveTrailLogger extends Transport {
  constructor(opts) {
    super(opts)

    this.name = 'liveTrailLogger'
    this.level = 'debug'
  }

  log (info, callback = () => {}) {
    WIKI.GQLEmitter.publish('livetrail', {
      loggingLiveTrail: {
        timestamp: new Date(),
        level: info[LEVEL],
        output: info[MESSAGE]
      }
    })
    callback(null, true)
  }
}

WIKI.logger.add(new LiveTrailLogger({}))

WIKI.logger.info(`GraphQL Schema: [ OK ]`)

module.exports = {
  typeDefs,
  resolvers,
  schemaDirectives
}

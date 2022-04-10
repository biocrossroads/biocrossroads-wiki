const Model = require('objection').Model
const path = require('path')
const fs = require('fs-extra')
const _ = require('lodash')
const yaml = require('js-yaml')
const commonHelper = require('../helpers/common')

/* global WIKI */

/**
 * Storage model
 */
module.exports = class Storage extends Model {
  static get tableName() { return 'storage' }
  static get idColumn() { return 'key' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['module', 'isEnabled', 'siteId'],

      properties: {
        module: {type: 'string'},
        isEnabled: {type: 'boolean'},
        SVGAnimatedInteger: {type: 'string'}
      }
    }
  }

  static get jsonAttributes() {
    return ['contentTypes', 'assetDelivery', 'versioning', 'schedule', 'config', 'state']
  }

  static async getTargets ({ siteId }) {
    return WIKI.models.storage.query().where(builder => {
      if (siteId) {
        builder.where('siteId', siteId)
      }
    })
  }

  static async refreshTargetsFromDisk () {
    let trx
    try {
      // -> Fetch definitions from disk
      const storageDirs = await fs.readdir(path.join(WIKI.SERVERPATH, 'modules/storage'))
      WIKI.storage.defs = []
      for (const dir of storageDirs) {
        const def = await fs.readFile(path.join(WIKI.SERVERPATH, 'modules/storage', dir, 'definition.yml'), 'utf8')
        const defParsed = yaml.load(def)
        defParsed.key = dir
        defParsed.isLoaded = false
        WIKI.storage.defs.push(defParsed)
        WIKI.logger.debug(`Loaded storage module definition ${dir}: [ OK ]`)
      }
      WIKI.logger.info(`Loaded ${WIKI.storage.defs.length} storage module definitions: [ OK ]`)
    } catch (err) {
      WIKI.logger.error('Failed to scan or load new storage providers: [ FAILED ]')
      WIKI.logger.error(err)
      if (trx) {
        trx.rollback()
      }
    }
  }

  /**
 * Ensure a storage module is loaded
 */
  static async ensureModule (moduleName) {
    if (!_.has(WIKI.storage.modules, moduleName)) {
      try {
        WIKI.storage.modules[moduleName] = require(`../modules/storage/${moduleName}/storage`)
        WIKI.logger.debug(`Activated storage module ${moduleName}: [ OK ]`)
        return true
      } catch (err) {
        WIKI.logger.warn(`Failed to load storage module ${moduleName}: [ FAILED ]`)
        WIKI.logger.warn(err)
        return false
      }
    } else {
      return true
    }
  }

  /**
   * Initialize active storage targets
   */
  static async initTargets () {
    const dbTargets = await WIKI.models.storage.query().where('isEnabled', true)
    const activeModules = _.uniq(dbTargets.map(t => t.module))
    try {
      // -> Stop and delete existing jobs
      // const prevjobs = _.remove(WIKI.scheduler.jobs, job => job.name === 'sync-storage')
      // if (prevjobs.length > 0) {
      //   prevjobs.forEach(job => job.stop())
      // }

      // -> Load active modules
      for (const md of activeModules) {
        this.ensureModule(md)
      }

      // -> Initialize targets
      // for (const target of this.targets) {
      //   const targetDef = _.find(WIKI.data.storage, ['key', target.key])
      //   target.fn = require(`../modules/storage/${target.key}/storage`)
      //   target.fn.config = target.config
      //   target.fn.mode = target.mode
      //   try {
      //     await target.fn.init()

      //     // -> Save succeeded init state
      //     await WIKI.models.storage.query().patch({
      //       state: {
      //         status: 'operational',
      //         message: '',
      //         lastAttempt: new Date().toISOString()
      //       }
      //     }).where('key', target.key)

      //     // -> Set recurring sync job
      //     if (targetDef.schedule && target.syncInterval !== 'P0D') {
      //       WIKI.scheduler.registerJob({
      //         name: 'sync-storage',
      //         immediate: false,
      //         schedule: target.syncInterval,
      //         repeat: true
      //       }, target.key)
      //     }

      //     // -> Set internal recurring sync job
      //     if (targetDef.internalSchedule && targetDef.internalSchedule !== 'P0D') {
      //       WIKI.scheduler.registerJob({
      //         name: 'sync-storage',
      //         immediate: false,
      //         schedule: target.internalSchedule,
      //         repeat: true
      //       }, target.key)
      //     }
      //   } catch (err) {
      //     // -> Save initialization error
      //     await WIKI.models.storage.query().patch({
      //       state: {
      //         status: 'error',
      //         message: err.message,
      //         lastAttempt: new Date().toISOString()
      //       }
      //     }).where('key', target.key)
      //   }
      // }
    } catch (err) {
      WIKI.logger.warn(err)
      throw err
    }
  }

  static async pageEvent({ event, page }) {
    try {
      for (let target of this.targets) {
        await target.fn[event](page)
      }
    } catch (err) {
      WIKI.logger.warn(err)
      throw err
    }
  }

  static async assetEvent({ event, asset }) {
    try {
      for (let target of this.targets) {
        await target.fn[`asset${_.capitalize(event)}`](asset)
      }
    } catch (err) {
      WIKI.logger.warn(err)
      throw err
    }
  }

  static async getLocalLocations({ asset }) {
    const locations = []
    const promises = this.targets.map(async (target) => {
      try {
        const path = await target.fn.getLocalLocation(asset)
        locations.push({
          path,
          key: target.key
        })
      } catch (err) {
        WIKI.logger.warn(err)
      }
    })
    await Promise.all(promises)
    return locations
  }

  static async executeAction(targetKey, handler) {
    try {
      const target = _.find(this.targets, ['key', targetKey])
      if (target) {
        if (_.hasIn(target.fn, handler)) {
          await target.fn[handler]()
        } else {
          throw new Error('Invalid Handler for Storage Target')
        }
      } else {
        throw new Error('Invalid or Inactive Storage Target')
      }
    } catch (err) {
      WIKI.logger.warn(err)
      throw err
    }
  }
}

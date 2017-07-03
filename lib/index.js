'use strict'

const fs = require('fs')
const axios = require('axios')
const https = require('https')
const flame = require('@leonardvandriel/flame')

module.exports = new class {

    // Initialization

    get apiKey() {
        if (this._apiKey === undefined) { throw new Error('Fireman expects apiKey to be set, or useLocalDB(..)') }
        return this.apiKey
    }

    set apiKey(apiKey) {
        this._apiKey = apiKey
    }

    get appName() {
        if (this._appName === undefined) { throw new Error('Fireman expects appName to be set, or useLocalDB(..)') }
        return this.appName
    }

    set app_name(app_name) {
        this._app_name = app_name
    }

    useLocalDB(filename) {
        if (!fs.existsSync(filename)) { throw new Error(`Local database file not found: ${filename}`) }
        this._use_local = true
        this._filename = filename
        this.load()
    }

    get localDB() {
        return flame.database
    }

    useLogger(logger) {
        this.logger = logger
    }

    // Storage

    load() {
        const json = fs.readFileSync(this._filename, 'utf8')
        flame.loadJSON(json)
    }

    save() {
        const json = JSON.stringify(flame.database)
        fs.writeFileSync(this._filename, json, 'utf8')
    }

    // Http

    composeUrl(path, query) {
        let url
        query = query || {}
        path = path || '/'
        query.auth = query.auth || this._apiKey
        for (let key in query) {
            if (!url) {
                url = `https://${this._appName}.firebaseio.com${path}.json?`
            } else {
                url = `${url}&`
            }
            url = `${url}${key}=${query[key]}`
        }
        return url
    }

    httpsAgent() {
        if (!this.agent) {
            this.agent = new https.Agent({ keepAlive: true })
        }
        return this.agent
    }

    axiosConfig() {
        return { timeout: 10000, httpsAgent: this.httpsAgent() }
    }

    // Base Operations

    get(path, query) {
        this.log('get', path, query)
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.get(path[i], query))
            }
            return Promise.all(promises).then(results => this.mergeObjects(results))
        }
        if (this._use_local) { return this.sleep().then(_ => flame.get(path, query)) }
        return this.retry(3, 2, _ => axios.get(this.composeUrl(path, query), this.axiosConfig()).then(response => response.data))
    }

    patch(path, value) {
        this.log('patch', path, value)
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.patch(path[i], value))
            }
            return Promise.all(promises)
        }
        if (this._use_local) { return this.sleep().then(_ => flame.patch(path, value)) }
        return this.retry(3, 2, _ => axios.patch(this.composeUrl(path), value, this.axiosConfig()).then(response => response.data))
    }

    put(path, value) {
        this.log('put', path, value)
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.put(path[i], value))
            }
            return Promise.all(promises)
        }
        if (this._use_local) { return this.sleep().then(_ => flame.put(path, value)) }
        return this.retry(3, 2, _ => axios.put(this.composeUrl(path), value, this.axiosConfig()).then(response => response.data))
    }

    post(path, value, key) {
        this.log('post', path, value, key)
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.post(path[i], value, key))
            }
            return Promise.all(promises)
        }
        if (key) {
            if (this._use_local) { return this.sleep().then(_ => flame.patch(`${path}/${key}`, value)).then(data => data ? { name: key } : data) }
            return this.retry(3, 2, _ => axios.patch(this.composeUrl(`${path}/${key}`), value, this.axiosConfig()).then(response => response.data ? { name: key } : response.data))
        } else {
            if (this._use_local) { return this.sleep().then(_ => flame.post(path, value)) }
            return this.retry(3, 2, _ => axios.post(this.composeUrl(path), value, this.axiosConfig()).then(response => response.data))
        }
    }

    delete(path) {
        this.log('delete', path)
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.delete(path[i]))
            }
            return Promise.all(promises)
        }
        if (this._use_local) { return this.sleep().then(_ => flame.delete(path)) }
        return this.retry(3, 2, _ => axios.delete(this.composeUrl(path), this.axiosConfig()).then(response => response.data))
    }

    // Helper Operations

    keys(path, query) {
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.keys(path[i], query))
            }
            return Promise.all(promises).then(results => results.reduce((result, array) => result.concat(array), []))
        }
        return this.get(path, this.merge(query, { shallow: true })).then(data => util.keys(data))
    }

    values(path, query) {
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.values(path[i], query))
            }
            return Promise.all(promises).then(results => results.reduce((result, array) => result.concat(array), []))
        }
        return this.get(path, query).then(data => util.values(data))
    }

    increment(path, deltas) {
        if (Array.isArray(path)) {
            const promises = []
            for (let i in path) {
                promises.push(this.increment(path[i], deltas))
            }
            return Promise.all(promises)
        }
        return this.get(path).then(object => {
            const values = {}
            for (let key in deltas) {
                values[key] = ((object || {})[key] || 0) + deltas[key]
            }
            return this.patch(path, values)
        })
    }

    batch(path, start, limit) {
        return this.get(path, { orderBy: '"$key"', startAt: `"${start}"`, limitToFirst: limit })
    }

    iterator(path, limit) {
        let start = ''
        let busy = false
        return { next: _ => {
            if (busy) { return new Error('iterator busy') }
            if (start === null) { return  }
            busy = true
            return this.batch(path, start, limit)
                .then(result => Array.isArray(result) ? util.arrayToObject(result) : result || {})
                .then(result => {
                    const keys = Object.keys(result)
                    if (keys.length == limit) {
                        const key = keys[keys.length - 1]
                        start = key.match(/^[0-9]+$/) ? `${parseInt(key) + 1}` : this.nextKey(key)
                    } else {
                        start = null
                    }
                    busy = false
                    return result
                })
        }}
    }

    iterate(path, limit, count, operator) {
        const iterator = this.iterator(path, limit)
        const run = _ => {
            const results = iterator.next()
            return results ? results.then(results => {
                const operations = []
                for (let key in results) {
                    operations.push(_ => operator(key, results[key]))
                }
                return this.parallel(operations, count).then(_ => run())
            }) : results
        }
        return Promise.resolve(run()).then(_ => null)
    }

    // Rules

    fetchRules() {
        return this.get('/.settings/rules').then(result => result ? result.rules : result)
    }

    updateRules(rules) {
        return this.put('/.settings/rules', { rules })
    }

    parseRules() {
        const json = fs.readFileSync('./config/rules.json', 'utf8')
        return JSON.parse(json)
    }

    diffRules() {
        return Promise.all([this.parseRules(), this.fetchRules()]).then(pair => this.diff(pair[0], pair[1]))
    }

    deployRules() {
        return this.parseRules().then(rules => this.updateRules(rules))
    }

    // Debug

    fetchRootKeys() {
        return this.keys('')
    }

    keyForNow() {
        return this.keyForTimestamp(Date.now())
    }

    keyForTimestamp(timestamp) {
        return flame.generateKey(timestamp)
    }

    timestampForKey(key) {
        return flame.timestampForKey(key)
    }

    nextKey(key) {
        return key.substring(0, key.length - 1) + String.fromCharCode(key.charCodeAt(key.length - 1) + 1)
    }

    // Utilities

    log() {
        if (this.logger) {
            this.logger.apply(this, arguments)
        }
    }

    sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, (seconds || 0) * 1000))
    }

    retry(count, wait, operation) {
        if (count > 0) {
            return Promise.resolve(operation()).catch(err => {
                return Promise.resolve(this.sleep(wait)).then(_ => this.retry(count - 1, wait * 2, operation))
            })
        } else {
            return Promise.resolve(operation())
        }
    }

    parallel(operations, count) {
        if (operations.length > 0) {
            const results = []
            const counter = { count: -1 }
            const run = () => {
                const i = (counter.count += 1)
                if (i < operations.length) {
                    const operation = operations[i]
                    return Promise.resolve(operation()).then(result => {
                        results[i] = result
                        return run()
                    })
                }
            }
            const promises = []
            for (let i = 0; i < count; i++) {
                promises.push(run())
            }
            return Promise.all(promises).then(_ => results)
        } else {
            return Promise.resolve([])
        }
    }

    merge(objects) {
        const array = []
        for (let i = 0; i < arguments.length; i++) {
            array.push(arguments[i])
        }
        return this.mergeObjects(array)
    }

    mergeObjects(objects) {
        let result = undefined
        for (let i in objects) {
            const object = objects[i]
            if (object && result === undefined) {
                result = {}
            }
            for (let key in object) {
                result[key] = object[key]
            }
        }
        return result
    }

    diff(a, b) {
        if (typeof a !== typeof b) {
            return `type: ${typeof a} != ${typeof b}`
        }
        if ((a === null) !== (b === null)) {
            return `type: ${a && typeof a} != ${b && typeof b}`
        }
        if (Array.isArray(a)) {
            const diff = this.diff(a.length, b.length)
            if (diff) {
                return `length: ${diff}`
            }
            for (let i in a) {
                const diff = this.diff(a[i], b[i])
                if (diff) {
                    return `at ${i}: ${diff}`
                }
            }
            return
        }
        if (typeof a === 'object') {
            const diff = this.diff(Object.keys(a).sort(), Object.keys(b).sort())
            if (diff) {
                return `keys: ${diff}`
            }
            for (let key in a) {
                const diff = this.diff(a[key], b[key])
                if (diff) {
                    return `for ${key}: ${diff}`
                }
            }
            return
        }
        if (a !== b) {
            return `${a} != ${b}`
        }
    }
}
